import { ethers } from "ethers";
import { storage } from "./storage";

const BSC_RPC_URLS = [
  "https://bsc-dataseed1.binance.org:443",
  "https://bsc-dataseed2.binance.org:443",
  "https://bsc-dataseed3.binance.org:443",
];
const USDT_BSC_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";

export class BlockchainPaymentListener {
  private provider: ethers.JsonRpcProvider;
  private lastBlockChecked = 0;
  private checkInterval: NodeJS.Timer | null = null;

  constructor() {
    this.provider = new ethers.JsonRpcProvider(BSC_RPC_URLS[0]);
  }

  async startListening() {
    try {
      console.log("[BlockchainListener] Starting USDT listener on BSC");
      const currentBlock = await this.provider.getBlockNumber();
      this.lastBlockChecked = Math.max(0, currentBlock - 10);
      
      // Check every 60 seconds instead of 30 to reduce rate limiting
      this.checkInterval = setInterval(() => this.checkForTransfers(), 60000);
      console.log("[BlockchainListener] ✅ Listener started (checking every 60s)");
    } catch (error) {
      console.error("[BlockchainListener] Error starting:", error);
    }
  }

  private isRateLimitError(error: any): boolean {
    const errorStr = JSON.stringify(error);
    return errorStr.includes("-32005") || errorStr.includes("rate limit");
  }

  private async getLogsWithRetry(filter: any, walletAddress: string, attempt = 1): Promise<ethers.Log[]> {
    try {
      console.log(`[BlockchainListener] Fetching logs for ${walletAddress} (attempt ${attempt}/3)`);
      return await this.provider.getLogs(filter);
    } catch (error: any) {
      if (this.isRateLimitError(error) && attempt < 3) {
        console.warn(`[BlockchainListener] Rate limit hit for ${walletAddress} (attempt ${attempt}/3), retrying in 3s...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
        return this.getLogsWithRetry(filter, walletAddress, attempt + 1);
      }
      throw error;
    }
  }

  private async checkForTransfers() {
    try {
      const currentBlock = await this.provider.getBlockNumber();
      const wallets = await storage.getAllPaymentWallets();
      
      for (const walletObj of wallets) {
        const wallet = walletObj.payment_wallets;
        if (!wallet || wallet.status !== "in_use") continue;

        // To avoid rate limits, split large block ranges
        const blockRange = currentBlock - this.lastBlockChecked;
        let fromBlock = this.lastBlockChecked;
        let toBlock = Math.min(fromBlock + 2000, currentBlock); // Max 2000 blocks per query
        
        while (fromBlock <= currentBlock) {
          const filter = {
            address: USDT_BSC_ADDRESS,
            topics: [
              ethers.id("Transfer(address,address,uint256)"),
              null,
              ethers.getAddress(wallet.address)
            ],
            fromBlock: fromBlock,
            toBlock: toBlock
          };

          try {
            const logs = await this.getLogsWithRetry(filter, wallet.address);
            console.log(`[BlockchainListener] Found ${logs.length} logs for ${wallet.address} (blocks ${fromBlock}-${toBlock})`);
            
            for (const log of logs) {
              if (log.topics.length >= 3) {
                const amount = BigInt(log.data);
                const amountFormatted = ethers.formatUnits(amount, 6);
                const parsedAmount = parseFloat(amountFormatted);
                console.log(`[BlockchainListener] ✅ Received ${amountFormatted} USDT at wallet ${wallet.address}`);
                
                // Record incoming payment (this now triggers auto-forward automatically)
                await storage.recordPaymentWalletIncoming(wallet.id, parsedAmount, log.transactionHash);
              }
            }
          } catch (err: any) {
            if (this.isRateLimitError(err)) {
              console.warn(`[BlockchainListener] ⚠️ Rate limit for blocks ${fromBlock}-${toBlock}, will retry next cycle`);
              break; // Break out of this wallet's block range loop
            } else {
              console.error(`[BlockchainListener] ❌ Error for blocks ${fromBlock}-${toBlock}:`, err.message);
              break;
            }
          }
          
          fromBlock = toBlock + 1;
          toBlock = Math.min(fromBlock + 2000, currentBlock);
        }
      }
      this.lastBlockChecked = currentBlock;
    } catch (error) {
      console.error("[BlockchainListener] ❌ checkForTransfers error:", error);
    }
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval as any);
      console.log("[BlockchainListener] Stopped");
    }
  }
}

export const blockchainPaymentListener = new BlockchainPaymentListener();
