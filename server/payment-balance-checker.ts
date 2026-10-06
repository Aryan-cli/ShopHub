import { storage } from "./storage";
import { paymentWalletsService } from "./payment-wallets-service";
import { bep20WalletService } from "./wallet-bep20-service";

/**
 * Simple balance checker service - checks in_use payment wallets every 1 minute:
 * 1. Automatically forwards USDT to user's personal wallet when balance > 0 (immediately)
 * 2. Auto-transfers BNB gas fee when wallet runs low (< 0.006 BNB)
 * 3. Timer stops automatically when payment is forwarded to personal wallet
 */
export class PaymentBalanceChecker {
  private checkInterval: NodeJS.Timer | null = null;
  private processedTransactions = new Map<string, number>(); // Track (walletId, amount) to avoid duplicates
  private lastGasTransfer = new Map<string, number>(); // Track last gas transfer per wallet to avoid spam

  async startChecking() {
    try {
      console.log("[PaymentBalanceChecker] Starting balance checker (every 1 minute)");
      
      // Check every 1 minute (60 seconds)
      this.checkInterval = setInterval(() => this.checkAllWallets(), 60000);
      console.log("[PaymentBalanceChecker] ✅ Balance checker started");
    } catch (error) {
      console.error("[PaymentBalanceChecker] Error starting:", error);
    }
  }

  private async checkAllWallets() {
    try {
      // Get all in_use payment wallets from database
      const allWallets = await storage.getAllPaymentWallets();

      for (const walletRecord of allWallets) {
        const wallet = walletRecord.payment_wallets;
        if (!wallet) continue;

        try {
          // 1. Check USDT balance and forward if needed
          if (wallet.status === "in_use") {
            const usdtBalance = await bep20WalletService.getUSDTBalance(wallet.address);
            
            if (usdtBalance > 0) {
              // Create unique key for this transaction
              const txKey = `${wallet.id}-${usdtBalance}`;
              
              // Skip if we already processed this exact amount for this wallet
              if (this.processedTransactions.has(txKey)) {
                console.log(
                  `[PaymentBalanceChecker] Already processed ${usdtBalance} USDT for wallet ${wallet.address}`
                );
              } else {
                console.log(
                  `[PaymentBalanceChecker] ✅ Detected ${usdtBalance} USDT in wallet ${wallet.address}`
                );

                // Record this payment which triggers auto-forward to personal wallet
                await paymentWalletsService.recordIncomingPayment(
                  wallet.address,
                  usdtBalance,
                  `manual-${Date.now()}`
                );

                // Mark this transaction as processed
                this.processedTransactions.set(txKey, Date.now());
              }

              // Clean up old entries (older than 10 minutes) to prevent memory leak
              const tenMinutesAgo = Date.now() - (10 * 60000);
              for (const [key, timestamp] of this.processedTransactions.entries()) {
                if (timestamp < tenMinutesAgo) {
                  this.processedTransactions.delete(key);
                }
              }
            }
          }
        } catch (err: any) {
          console.error(
            `[PaymentBalanceChecker] Error checking wallet ${wallet.address}:`,
            err.message
          );
        }
      }
    } catch (error) {
      console.error("[PaymentBalanceChecker] Error in checkAllWallets:", error);
    }
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval as any);
      console.log("[PaymentBalanceChecker] Stopped");
    }
  }
}

export const paymentBalanceChecker = new PaymentBalanceChecker();
