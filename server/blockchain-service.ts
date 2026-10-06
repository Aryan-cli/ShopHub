/**
 * BTC Payment Verification Service using Mempool.space REST API
 * Documentation: https://mempool.space/docs/api/rest
 */

interface MempoolAddressResponse {
  address: string;
  chain_stats: {
    funded_txo_count: number;
    funded_txo_sum: number;
    spent_txo_count: number;
    spent_txo_sum: number;
    tx_count: number;
  };
  mempool_stats: {
    funded_txo_count: number;
    funded_txo_sum: number;
    spent_txo_count: number;
    spent_txo_sum: number;
    tx_count: number;
  };
}

interface MempoolTransaction {
  txid: string;
  version: number;
  locktime: number;
  vin: Array<{
    txid: string;
    vout: number;
    prevout?: {
      scriptpubkey: string;
      scriptpubkey_address?: string;
      scriptpubkey_asm: string;
      scriptpubkey_type: string;
      value: number;
    };
    scriptsig: string;
    scriptsig_asm: string;
    sequence: number;
  }>;
  vout: Array<{
    scriptpubkey: string;
    scriptpubkey_address?: string;
    scriptpubkey_asm: string;
    scriptpubkey_type: string;
    value: number;
  }>;
  size: number;
  weight: number;
  fee: number;
  status: {
    confirmed: boolean;
    block_height?: number;
    block_hash?: string;
    block_time?: number;
  };
}

interface BlockchainTransaction {
  txHash: string;
  value: number;
  confirmations: number;
  time: number;
  fromAddress?: string;
}

interface AddressInfo {
  address: string;
  balance: number;
  totalReceived: number;
  transactions: BlockchainTransaction[];
}

interface PaymentVerificationResult {
  verified: boolean;
  txHash?: string;
  actualAmount?: number;
  confirmations?: number;
  fromAddress?: string;
}

interface TransactionDetails {
  confirmed: boolean;
  confirmations: number;
  value: number;
  inputs: { address: string }[];
  outputs: { address: string; value: number }[];
}

interface SearchPaymentResult {
  found: boolean;
  txHash?: string;
  confirmations?: number;
}

export class BlockchainService {
  private readonly mempoolApiUrl = 'https://mempool.space/api';
  private readonly satoshisPerBtc = 100000000;
  
  private async fetchWithRetry<T>(url: string, retries = 3): Promise<T | null> {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(url, {
          headers: {
            'Accept': 'application/json',
          },
        });
        
        if (!response.ok) {
          console.error(`[BlockchainService] API error: ${response.status} ${response.statusText} for ${url}`);
          if (response.status === 429) {
            await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
            continue;
          }
          return null;
        }
        
        return await response.json() as T;
      } catch (error) {
        console.error(`[BlockchainService] Fetch attempt ${i + 1} failed:`, error);
        if (i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, 500 * (i + 1)));
        }
      }
    }
    return null;
  }

  private async getCurrentBlockHeight(): Promise<number> {
    for (let i = 0; i < 3; i++) {
      try {
        const response = await fetch(`${this.mempoolApiUrl}/blocks/tip/height`);
        if (response.ok) {
          const text = await response.text();
          const height = parseInt(text, 10);
          if (!isNaN(height) && height > 0) {
            return height;
          }
        }
        await new Promise(resolve => setTimeout(resolve, 500 * (i + 1)));
      } catch (error) {
        console.error(`[BlockchainService] Block height fetch attempt ${i + 1} failed:`, error);
        if (i < 2) {
          await new Promise(resolve => setTimeout(resolve, 500 * (i + 1)));
        }
      }
    }
    console.error('[BlockchainService] All block height fetch attempts failed');
    return 0;
  }

  async getAddressInfo(address: string): Promise<AddressInfo | null> {
    try {
      console.log(`[BlockchainService] Getting address info for: ${address}`);

      const addressData = await this.fetchWithRetry<MempoolAddressResponse>(
        `${this.mempoolApiUrl}/address/${address}`
      );

      if (!addressData) {
        console.error('[BlockchainService] Failed to fetch address data');
        return null;
      }

      const txsData = await this.fetchWithRetry<MempoolTransaction[]>(
        `${this.mempoolApiUrl}/address/${address}/txs`
      );

      const currentHeight = await this.getCurrentBlockHeight();
      
      let transactions: BlockchainTransaction[] = [];
      
      if (txsData && Array.isArray(txsData)) {
        console.log(`[BlockchainService] Found ${txsData.length} transactions for address`);
        
        transactions = txsData.slice(0, 50).map((tx) => {
          let receivedValue = 0;
          let fromAddr: string | undefined;

          for (const vout of tx.vout) {
            if (vout.scriptpubkey_address === address) {
              receivedValue += vout.value;
            }
          }

          if (tx.vin.length > 0 && tx.vin[0].prevout?.scriptpubkey_address) {
            fromAddr = tx.vin[0].prevout.scriptpubkey_address;
          }

          const confirmations = tx.status.confirmed && tx.status.block_height
            ? Math.max(0, currentHeight - tx.status.block_height + 1)
            : 0;

          return {
            txHash: tx.txid,
            value: receivedValue / this.satoshisPerBtc,
            confirmations,
            time: tx.status.block_time ? tx.status.block_time * 1000 : Date.now(),
            fromAddress: fromAddr,
          };
        }).filter((tx) => tx.value > 0);
      }

      const chainStats = addressData.chain_stats;
      const balance = (chainStats.funded_txo_sum - chainStats.spent_txo_sum) / this.satoshisPerBtc;
      const totalReceived = chainStats.funded_txo_sum / this.satoshisPerBtc;

      console.log(`[BlockchainService] Address ${address}: balance=${balance} BTC, totalReceived=${totalReceived} BTC, txCount=${transactions.length}`);

      return {
        address: addressData.address,
        balance,
        totalReceived,
        transactions,
      };
    } catch (error) {
      console.error('[BlockchainService] Failed to get address info:', error);
      return null;
    }
  }

  async verifyPayment(
    depositAddress: string,
    expectedAmount: number,
    buyerAddress?: string,
    minTimestampMs?: number
  ): Promise<PaymentVerificationResult> {
    try {
      console.log(`[BlockchainService] Verifying BTC payment to ${depositAddress}`);
      console.log(`[BlockchainService] Expected amount: ${expectedAmount} BTC`);
      if (buyerAddress) {
        console.log(`[BlockchainService] Buyer address filter: ${buyerAddress}`);
      }
      if (minTimestampMs) {
        console.log(`[BlockchainService] Only counting transactions after: ${new Date(minTimestampMs).toISOString()}`);
      }

      const addressInfo = await this.getAddressInfo(depositAddress);

      if (!addressInfo) {
        console.log('[BlockchainService] Could not get address info');
        return { verified: false };
      }

      console.log(`[BlockchainService] Found ${addressInfo.transactions.length} incoming transactions`);

      for (const tx of addressInfo.transactions) {
        // Skip transactions that happened before the escrow order was created
        if (minTimestampMs && tx.time < minTimestampMs) {
          console.log(`[BlockchainService] TX ${tx.txHash.substring(0, 16)}... skipped - too old (${new Date(tx.time).toISOString()})`);
          continue;
        }

        const amountDiff = Math.abs(tx.value - expectedAmount);
        // Strict tolerance: 2% or minimum 0.000001 BTC to prevent underpayment fraud
        const percentageTolerance = expectedAmount * 0.02;
        const minimumTolerance = 0.000001;
        const tolerance = Math.max(percentageTolerance, minimumTolerance);

        console.log(`[BlockchainService] TX ${tx.txHash.substring(0, 16)}...:`);
        console.log(`  Amount: ${tx.value} BTC (expected: ${expectedAmount} BTC)`);
        console.log(`  Time: ${new Date(tx.time).toISOString()}`);
        console.log(`  Diff: ${amountDiff}, Tolerance: ${tolerance}`);
        console.log(`  Confirmations: ${tx.confirmations}`);
        console.log(`  From: ${tx.fromAddress || 'unknown'}`);

        if (amountDiff <= tolerance) {
          if (buyerAddress && tx.fromAddress && 
              tx.fromAddress.toLowerCase() !== buyerAddress.toLowerCase()) {
            console.log(`[BlockchainService] Sender mismatch: expected ${buyerAddress}, got ${tx.fromAddress}`);
            continue;
          }

          console.log(`[BlockchainService] Payment VERIFIED! TxHash: ${tx.txHash}`);
          return {
            verified: true,
            txHash: tx.txHash,
            actualAmount: tx.value,
            confirmations: tx.confirmations,
            fromAddress: tx.fromAddress,
          };
        }
      }

      console.log('[BlockchainService] No matching payment found');
      return { verified: false };
    } catch (error) {
      console.error('[BlockchainService] Payment verification error:', error);
      return { verified: false };
    }
  }

  async getTransaction(txHash: string): Promise<TransactionDetails | null> {
    try {
      console.log(`[BlockchainService] Getting transaction: ${txHash}`);
      
      const tx = await this.fetchWithRetry<MempoolTransaction>(
        `${this.mempoolApiUrl}/tx/${txHash}`
      );

      if (!tx) {
        console.log('[BlockchainService] Transaction not found');
        return null;
      }

      const currentHeight = await this.getCurrentBlockHeight();
      const confirmations = tx.status.confirmed && tx.status.block_height
        ? Math.max(0, currentHeight - tx.status.block_height + 1)
        : 0;

      const totalValue = tx.vout.reduce((sum, out) => sum + out.value, 0) / this.satoshisPerBtc;

      return {
        confirmed: tx.status.confirmed,
        confirmations,
        value: totalValue,
        inputs: tx.vin.map((input) => ({
          address: input.prevout?.scriptpubkey_address || '',
        })),
        outputs: tx.vout.map((output) => ({
          address: output.scriptpubkey_address || '',
          value: output.value / this.satoshisPerBtc,
        })),
      };
    } catch (error) {
      console.error('[BlockchainService] Failed to get transaction:', error);
      return null;
    }
  }

  async searchPaymentByBuyerAddress(
    buyerAddress: string,
    expectedAmount: number,
    depositAddress: string,
    minTimestampMs?: number
  ): Promise<SearchPaymentResult> {
    try {
      console.log(`[BlockchainService] Searching for payment from ${buyerAddress} to ${depositAddress}`);
      console.log(`[BlockchainService] Expected amount: ${expectedAmount} BTC`);
      if (minTimestampMs) {
        console.log(`[BlockchainService] Only counting transactions after: ${new Date(minTimestampMs).toISOString()}`);
      }

      const txsData = await this.fetchWithRetry<MempoolTransaction[]>(
        `${this.mempoolApiUrl}/address/${buyerAddress}/txs`
      );

      if (!txsData || !Array.isArray(txsData)) {
        console.log('[BlockchainService] No transactions found for buyer address');
        return { found: false };
      }

      const currentHeight = await this.getCurrentBlockHeight();

      for (const tx of txsData) {
        // Skip transactions that happened before the escrow order was created
        const txTime = tx.status.block_time ? tx.status.block_time * 1000 : Date.now();
        if (minTimestampMs && txTime < minTimestampMs) {
          console.log(`[BlockchainService] TX ${tx.txid.substring(0, 16)}... skipped - too old`);
          continue;
        }

        for (const vout of tx.vout) {
          if (vout.scriptpubkey_address === depositAddress) {
            const value = vout.value / this.satoshisPerBtc;
            // Increased tolerance to 10% to account for network fees
            const percentageTolerance = expectedAmount * 0.10;
            const minimumTolerance = 0.00001;
            const tolerance = Math.max(percentageTolerance, minimumTolerance);

            console.log(`[BlockchainService] Found TX to deposit address: ${tx.txid}`);
            console.log(`  Amount: ${value} BTC (expected: ${expectedAmount} BTC)`);
            console.log(`  Time: ${new Date(txTime).toISOString()}`);

            if (Math.abs(value - expectedAmount) <= tolerance) {
              const confirmations = tx.status.confirmed && tx.status.block_height
                ? Math.max(0, currentHeight - tx.status.block_height + 1)
                : 0;

              console.log(`[BlockchainService] MATCH FOUND! Confirmations: ${confirmations}`);
              return {
                found: true,
                txHash: tx.txid,
                confirmations,
              };
            }
          }
        }
      }

      console.log('[BlockchainService] No matching payment found from buyer address');
      return { found: false };
    } catch (error) {
      console.error('[BlockchainService] Search failed:', error);
      return { found: false };
    }
  }

  async getCurrentBtcPrice(): Promise<number> {
    try {
      const response = await fetch(`${this.mempoolApiUrl}/v1/prices`);
      if (response.ok) {
        const data = await response.json();
        if (data.USD) {
          console.log(`[BlockchainService] BTC price from Mempool: $${data.USD}`);
          return data.USD;
        }
      }
    } catch (error) {
      console.log('[BlockchainService] Mempool price API failed, trying CoinGecko...');
    }

    try {
      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
      if (response.ok) {
        const data = await response.json();
        const price = data.bitcoin?.usd;
        if (price) {
          console.log(`[BlockchainService] BTC price from CoinGecko: $${price}`);
          return price;
        }
      }
    } catch (error) {
      console.error('[BlockchainService] CoinGecko price API also failed');
    }

    console.log('[BlockchainService] Using fallback BTC price: $100000');
    return 100000;
  }

  isValidBtcAddress(address: string): boolean {
    if (!address || typeof address !== 'string') return false;
    if (/^bc1[a-z0-9]{25,90}$/i.test(address)) return true;
    if (/^1[a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address)) return true;
    if (/^3[a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address)) return true;
    return false;
  }
}

export const blockchainService = new BlockchainService();
