import crypto from "crypto";
import { ethers } from "ethers";

const ENCRYPTION_KEY = process.env.WALLET_ENCRYPTION_KEY || "default-insecure-key-change-in-production";
const BEP20_RPC = process.env.BEP20_RPC_URL || "https://bsc-dataseed.binance.org";
const USDT_CONTRACT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";

export class BEP20WalletService {
  private provider: ethers.Provider;

  constructor() {
    this.provider = new ethers.JsonRpcProvider(BEP20_RPC);
  }

  generateWallet(): { address: string; seed: string; privateKey: string } {
    try {
      // Generate a new random wallet with random mnemonic
      const wallet = ethers.Wallet.createRandom();
      const seed = wallet.mnemonic?.phrase;
      
      if (!seed) {
        throw new Error("Failed to generate seed phrase");
      }

      return {
        address: wallet.address,
        seed: seed,
        privateKey: wallet.privateKey,
      };
    } catch (error) {
      console.error("Error generating BEP-20 wallet:", error);
      throw new Error("Failed to generate wallet");
    }
  }

  encryptSeed(seed: string): string {
    try {
      const algorithm = "aes-256-cbc";
      const key = crypto.createHash("sha256").update(ENCRYPTION_KEY).digest();
      const iv = crypto.randomBytes(16);
      
      const cipher = crypto.createCipheriv(algorithm, key, iv);
      let encrypted = cipher.update(seed, "utf-8", "hex");
      encrypted += cipher.final("hex");
      
      return iv.toString("hex") + ":" + encrypted;
    } catch (error) {
      console.error("Error encrypting seed:", error);
      throw new Error("Failed to encrypt seed");
    }
  }

  decryptSeed(encryptedSeed: string): string {
    try {
      const algorithm = "aes-256-cbc";
      const key = crypto.createHash("sha256").update(ENCRYPTION_KEY).digest();
      
      const parts = encryptedSeed.split(":");
      const iv = Buffer.from(parts[0], "hex");
      const decipher = crypto.createDecipheriv(algorithm, key, iv);
      
      let decrypted = decipher.update(parts[1], "hex", "utf-8");
      decrypted += decipher.final("utf-8");
      
      return decrypted;
    } catch (error) {
      console.error("Error decrypting seed:", error);
      throw new Error("Failed to decrypt seed");
    }
  }

  getAddressFromSeed(seed: string): string {
    try {
      const wallet = ethers.Wallet.fromPhrase(seed);
      return wallet.address;
    } catch (error) {
      console.error("Error getting address from seed:", error);
      throw new Error("Failed to derive address");
    }
  }

  getWalletFromSeed(seed: string): ethers.Wallet {
    try {
      const wallet = ethers.Wallet.fromPhrase(seed);
      return wallet.connect(this.provider);
    } catch (error) {
      console.error("Error creating wallet from seed:", error);
      throw new Error("Failed to create wallet");
    }
  }

  async sendUSDT(
    seedPhrase: string,
    recipientAddress: string,
    amount: number
  ): Promise<{ hash: string; success: boolean }> {
    try {
      const wallet = this.getWalletFromSeed(seedPhrase);
      
      if (!ethers.isAddress(recipientAddress)) {
        throw new Error("Invalid recipient address");
      }

      // Check if wallet has enough BNB for gas fees
      const bnbBalance = await this.provider.getBalance(wallet.address);
      console.log(`[BEP20] Wallet BNB balance: ${ethers.formatEther(bnbBalance)} BNB`);

      // Get current gas price
      const feeData = await this.provider.getFeeData();
      const gasPrice = feeData.gasPrice || ethers.parseUnits("5", "gwei");
      const gasLimit = BigInt(100000); // Standard gas limit for token transfer
      const gasCost = gasPrice * gasLimit;

      if (bnbBalance < gasCost) {
        throw new Error(`Insufficient BNB for gas. Have: ${ethers.formatEther(bnbBalance)} BNB, Need: ${ethers.formatEther(gasCost)} BNB`);
      }

      const USDT_ABI = [
        "function transfer(address to, uint256 amount) returns (bool)",
        "function balanceOf(address account) view returns (uint256)",
        "function decimals() view returns (uint8)",
      ];

      const contract = new ethers.Contract(USDT_CONTRACT_ADDRESS, USDT_ABI, wallet);
      const decimals = await contract.decimals();
      const amountBigInt = ethers.parseUnits(amount.toString(), decimals);

      // Check USDT balance before sending
      const usdtBalance = await contract.balanceOf(wallet.address);
      console.log(`[BEP20] USDT balance: ${ethers.formatUnits(usdtBalance, decimals)}, Amount to send: ${amount}`);

      if (usdtBalance < amountBigInt) {
        throw new Error(`Insufficient USDT balance. Have: ${ethers.formatUnits(usdtBalance, decimals)}, Need: ${amount}`);
      }

      const tx = await contract.transfer(recipientAddress, amountBigInt, {
        gasLimit: gasLimit,
        gasPrice: gasPrice
      });

      console.log(`[BEP20] USDT transaction sent! Hash: ${tx.hash}`);
      const receipt = await tx.wait();

      if (!receipt) {
        throw new Error("Transaction failed - no receipt received");
      }

      return {
        hash: receipt.hash,
        success: true,
      };
    } catch (error) {
      console.error("Error sending USDT:", error);
      throw new Error(`Failed to send USDT: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  async sendInitialBNB(recipientAddress: string): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      const masterSeed = process.env.BNB_MASTER_SEED || process.env.BTC_MASTER_SEED;
      if (!masterSeed) {
        return { success: false, error: "Platform wallet not configured" };
      }

      const wallet = this.getWalletFromSeed(masterSeed);
      
      if (!ethers.isAddress(recipientAddress)) {
        return { success: false, error: "Invalid recipient address" };
      }

      // Send 0.000008 BNB to cover gas fees
      const bnbAmount = ethers.parseEther("0.000008");
      
      // Check platform wallet BNB balance
      const bnbBalance = await this.provider.getBalance(wallet.address);
      console.log(`[BEP20] Platform BNB balance: ${ethers.formatEther(bnbBalance)} BNB`);

      if (bnbBalance < bnbAmount) {
        console.warn(`[BEP20] Platform wallet insufficient BNB. Have: ${ethers.formatEther(bnbBalance)}, Need: 0.000008`);
        return { success: false, error: "Platform wallet has insufficient BNB" };
      }

      // Send BNB transaction
      const tx = await wallet.sendTransaction({
        to: recipientAddress,
        value: bnbAmount,
        gasLimit: BigInt(21000),
        gasPrice: (await this.provider.getFeeData()).gasPrice || ethers.parseUnits("5", "gwei")
      });

      console.log(`[BEP20] Initial BNB transaction sent! Hash: ${tx.hash}`);
      const receipt = await tx.wait();

      if (!receipt) {
        return { success: false, error: "Transaction failed - no receipt received" };
      }

      return { success: true, txHash: receipt.hash };
    } catch (error) {
      console.error("Error sending initial BNB:", error);
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }

  async getUSDTBalance(walletAddress: string): Promise<number> {
    try {
      const USDT_ABI = [
        "function balanceOf(address account) view returns (uint256)",
        "function decimals() view returns (uint8)",
      ];

      const contract = new ethers.Contract(USDT_CONTRACT_ADDRESS, USDT_ABI, this.provider);
      const balance = await contract.balanceOf(walletAddress);
      const decimals = await contract.decimals();

      return parseFloat(ethers.formatUnits(balance, decimals));
    } catch (error) {
      console.error("Error getting USDT balance:", error);
      return 0;
    }
  }
}

export const bep20WalletService = new BEP20WalletService();
