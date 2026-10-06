import { db } from "./db";
import { paymentWallets, paymentSessions, users, userWallets } from "../shared/schema";
import { eq, and, lt, sql } from "drizzle-orm";
import { BnbWalletService } from "./bnb-wallet-service";
import { bep20WalletService } from "./wallet-bep20-service";
import { randomUUID } from "crypto";
import { JsonRpcProvider, formatEther } from "ethers";

export class PaymentWalletsService {
  private bnbService = new BnbWalletService();

  // Helper: Update payment link with new merchantOrderNo
  private updatePaymentLinkWithUid(basePaymentLink: string, uid: string): string {
    try {
      const url = new URL(basePaymentLink);
      url.searchParams.set("merchantOrderNo", uid);
      return url.toString();
    } catch (error) {
      console.error("[PaymentWallets] Error updating payment link:", error);
      return basePaymentLink;
    }
  }

  // Helper: Update payment link with amount
  updatePaymentLinkWithAmount(basePaymentLink: string, amount: number): string {
    try {
      const url = new URL(basePaymentLink);
      url.searchParams.set("fiatAmount", amount.toString());
      return url.toString();
    } catch (error) {
      console.error("[PaymentWallets] Error updating payment link with amount:", error);
      return basePaymentLink;
    }
  }

  // Get BNB balance for a wallet address
  async getBNBBalance(address: string): Promise<number> {
    try {
      const rpcUrl = process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org';
      const provider = new JsonRpcProvider(rpcUrl, { name: 'bsc', chainId: 56 });
      const balance = await provider.getBalance(address);
      return parseFloat(formatEther(balance));
    } catch (error) {
      console.error(`[PaymentWallets] Error getting BNB balance for ${address}:`, error);
      return 0;
    }
  }

  // Auto-transfer BNB gas fee from server wallet to payment wallet
  async autoTransferGasFee(paymentWalletAddress: string): Promise<boolean> {
    try {
      const MIN_GAS_FEE_BNB = 0.00001; // ~0.003 BNB per USDT transfer, need 2x
      const TRANSFER_AMOUNT_BNB = 0.00002; // Send 0.01 BNB for gas
      
      const currentBalance = await this.getBNBBalance(paymentWalletAddress);
      
      if (currentBalance >= MIN_GAS_FEE_BNB) {
        console.log(`[PaymentWallets] Wallet ${paymentWalletAddress} has sufficient gas (${currentBalance} BNB)`);
        return false; // No transfer needed
      }

      console.log(`[PaymentWallets] ⚠️ Low gas fee detected for wallet ${paymentWalletAddress} (${currentBalance} BNB). Sending ${TRANSFER_AMOUNT_BNB} BNB...`);

      // Send from server wallet (m/44'/60'/0'/0/0)
      const result = await this.bnbService.sendBnb(
        "m/44'/60'/0'/0/0",
        paymentWalletAddress,
        TRANSFER_AMOUNT_BNB
      );

      if (result.success) {
        console.log(`[PaymentWallets] ✅ Gas fee transferred! TxHash: ${result.txHash}`);
        return true;
      } else {
        console.error(`[PaymentWallets] ❌ Failed to transfer gas fee: ${result.error}`);
        return false;
      }
    } catch (error) {
      console.error(`[PaymentWallets] Error in autoTransferGasFee:`, error);
      return false;
    }
  }

  // Admin: Add a new payment wallet
  async addPaymentWallet(address: string, seedPhrase: string, paymentLink: string) {
    try {
      const existing = await db.select().from(paymentWallets).where(eq(paymentWallets.address, address));
      if (existing.length > 0) {
        throw new Error("Wallet address already exists");
      }

      const result = await db.insert(paymentWallets).values({
        address,
        seedPhrase,
        paymentLink,
        status: "idle",
      }).returning();

      return result[0];
    } catch (error) {
      console.error("[PaymentWallets] Error adding wallet:", error);
      throw error;
    }
  }

  // Admin: Update a payment wallet
  async updatePaymentWallet(walletId: string, address: string, seedPhrase: string, paymentLink: string) {
    try {
      // Check if address is already used by another wallet
      const existing = await db.select().from(paymentWallets).where(and(
        eq(paymentWallets.address, address),
        sql`id != ${walletId}`
      ));
      if (existing.length > 0) {
        throw new Error("Wallet address already exists");
      }

      const result = await db.update(paymentWallets).set({
        address,
        seedPhrase,
        paymentLink,
      }).where(eq(paymentWallets.id, walletId)).returning();

      if (result.length === 0) {
        throw new Error("Wallet not found");
      }

      return result[0];
    } catch (error) {
      console.error("[PaymentWallets] Error updating wallet:", error);
      throw error;
    }
  }

  // Admin: Get all payment wallets with status
  async getAllWallets() {
    try {
      const wallets = await db
        .select({
          id: paymentWallets.id,
          address: paymentWallets.address,
          paymentLink: paymentWallets.paymentLink,
          status: paymentWallets.status,
          assignedToUserId: paymentWallets.assignedToUserId,
          assignedUserName: users.username,
          assignedAt: paymentWallets.assignedAt,
          expiresAt: paymentWallets.expiresAt,
          lastIncomingAmount: paymentWallets.lastIncomingAmount,
          totalProcessed: paymentWallets.totalProcessed,
        })
        .from(paymentWallets)
        .leftJoin(users, eq(paymentWallets.assignedToUserId, users.id));

      // Check for expired assignments
      const now = new Date();
      for (const wallet of wallets) {
        if (wallet.status === "in_use" && wallet.expiresAt && wallet.expiresAt < now) {
          await db
            .update(paymentWallets)
            .set({
              status: "idle",
              assignedToUserId: null,
              assignedAt: null,
              expiresAt: null,
            })
            .where(eq(paymentWallets.id, wallet.id));
          wallet.status = "idle";
          wallet.assignedToUserId = null;
        }
      }

      return wallets;
    } catch (error) {
      console.error("[PaymentWallets] Error getting wallets:", error);
      throw error;
    }
  }

  // User: Get assigned wallet or find idle one
  async getOrAssignWallet(userId: string) {
    try {
      const now = new Date();
      const expiry = new Date(now.getTime() + 20 * 60000); // 20 minutes

      // CLEANUP: First, check all wallets and free up any that have expired
      const allWallets = await db.select().from(paymentWallets);
      for (const wallet of allWallets) {
        if (wallet.status === "in_use" && wallet.expiresAt && wallet.expiresAt < now) {
          console.log(`[PaymentWallets] Auto-releasing expired wallet: ${wallet.address}`);
          await db
            .update(paymentWallets)
            .set({
              status: "idle",
              assignedToUserId: null,
              assignedAt: null,
              expiresAt: null,
            })
            .where(eq(paymentWallets.id, wallet.id));
        }
      }

      // Check if user already has an ACTIVE (not expired) assignment
      const existing = await db
        .select()
        .from(paymentWallets)
        .where(
          and(
            eq(paymentWallets.assignedToUserId, userId),
            eq(paymentWallets.status, "in_use"),
            sql`${paymentWallets.expiresAt} > ${sql.raw(`'${now.toISOString()}'`)}`
          )
        );

      if (existing.length > 0) {
        console.log(`[PaymentWallets] Reusing active wallet for user ${userId}: ${existing[0].address}`);
        // For existing assignment, generate fresh UID and update payment link
        const currentUid = randomUUID();
        const updatedLink = this.updatePaymentLinkWithUid(existing[0].paymentLink, currentUid);
        return {
          ...existing[0],
          paymentLink: updatedLink,
          currentMerchantOrderNo: currentUid
        };
      }

      // Find first idle wallet
      const idleWallets = await db
        .select()
        .from(paymentWallets)
        .where(eq(paymentWallets.status, "idle"))
        .limit(1);

      if (idleWallets.length === 0) {
        throw new Error("No available payment wallets. System is in high demand. Wait for a moment.");
      }

      const wallet = idleWallets[0];
      console.log(`[PaymentWallets] Assigning new wallet to user ${userId}: ${wallet.address}`);

      // Immediately check and transfer gas if needed when assigning
      try {
        const bnbBalance = await this.getBNBBalance(wallet.address);
        const MIN_GAS_FEE = 0.006;
        if (bnbBalance < MIN_GAS_FEE) {
          console.log(`[PaymentWallets] Low gas on assignment for ${wallet.address}. Transferring...`);
          await this.autoTransferGasFee(wallet.address);
        }
      } catch (gasError) {
        console.error("[PaymentWallets] Error checking gas on assignment:", gasError);
      }

      // Generate new UID for this assignment
      const newUid = randomUUID();
      const updatedLink = this.updatePaymentLinkWithUid(wallet.paymentLink, newUid);

      // Assign to user
      const updated = await db
        .update(paymentWallets)
        .set({
          status: "in_use",
          assignedToUserId: userId,
          assignedAt: now,
          expiresAt: expiry,
        })
        .where(eq(paymentWallets.id, wallet.id))
        .returning();

      return {
        ...updated[0],
        paymentLink: updatedLink,
        currentMerchantOrderNo: newUid
      };
    } catch (error) {
      console.error("[PaymentWallets] Error assigning wallet:", error);
      throw error;
    }
  }

  // Create payment session
  async createPaymentSession(
    userId: string,
    walletId: string,
    requestedAmount: number,
    expectedUsdtAmount: number
  ) {
    try {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 20 * 60000); // 20 minutes

      const session = await db
        .insert(paymentSessions)
        .values({
          userId,
          walletId,
          requestedAmount,
          expectedUsdtAmount,
          status: "pending",
          expiresAt,
        })
        .returning();

      return session[0];
    } catch (error) {
      console.error("[PaymentWallets] Error creating session:", error);
      throw error;
    }
  }

  // Update incoming USDT amount (called by payment balance checker)
  async recordIncomingPayment(
    walletAddress: string,
    amount: number,
    transactionHash: string
  ) {
    try {
      // Find wallet
      const wallet = await db
        .select()
        .from(paymentWallets)
        .where(eq(paymentWallets.address, walletAddress));

      if (wallet.length === 0) {
        console.log("[PaymentWallets] Wallet not found:", walletAddress);
        return;
      }

      const w = wallet[0];

      // Update wallet stats
      await db
        .update(paymentWallets)
        .set({
          lastIncomingAmount: amount,
          lastTransactionHash: transactionHash,
          totalProcessed: (w.totalProcessed || 0) + amount,
          updatedAt: new Date(),
        })
        .where(eq(paymentWallets.id, w.id));

      // If wallet not assigned to user, we can't forward
      if (!w.assignedToUserId) {
        console.log("[PaymentWallets] Wallet not assigned to any user:", walletAddress);
        return;
      }

      // Find active pending session for this wallet
      const sessions = await db
        .select()
        .from(paymentSessions)
        .where(
          and(
            eq(paymentSessions.walletId, w.id),
            eq(paymentSessions.status, "pending")
          )
        );

      let sessionId = null;
      if (sessions.length > 0) {
        const session = sessions[0];
        sessionId = session.id;
        await db
          .update(paymentSessions)
          .set({
            receivedUsdtAmount: amount,
            transactionHash: transactionHash,
            status: "completed",
            completedAt: new Date(),
          })
          .where(eq(paymentSessions.id, session.id));

        console.log(
          `[PaymentWallets] Payment recorded for session ${session.id}: ${amount} USDT to user ${w.assignedToUserId}`
        );
      } else {
        console.log(
          `[PaymentWallets] No pending session, but wallet ${walletAddress} is assigned to user ${w.assignedToUserId} with balance ${amount} USDT`
        );
      }

      // Auto-forward to user's personal wallet (whether session was pending or not)
      await this.forwardToPersonalWallet(w.assignedToUserId, amount, w.id, sessionId || "no-session");
    } catch (error) {
      console.error("[PaymentWallets] Error recording payment:", error);
    }
  }

  // Release wallet after session expires
  async releaseWallet(walletId: string) {
    try {
      await db
        .update(paymentWallets)
        .set({
          status: "idle",
          assignedToUserId: null,
          assignedAt: null,
          expiresAt: null,
        })
        .where(eq(paymentWallets.id, walletId));

      console.log("[PaymentWallets] Wallet released:", walletId);
    } catch (error) {
      console.error("[PaymentWallets] Error releasing wallet:", error);
    }
  }

  // Delete payment wallet
  async deleteWallet(walletId: string) {
    try {
      // Check if wallet is in use
      const wallet = await db
        .select()
        .from(paymentWallets)
        .where(eq(paymentWallets.id, walletId));

      if (wallet.length === 0) {
        throw new Error("Wallet not found");
      }

      if (wallet[0].status === "in_use") {
        throw new Error("Cannot delete wallet that is currently in use. Release timer first.");
      }

      // Delete the wallet
      await db.delete(paymentWallets).where(eq(paymentWallets.id, walletId));

      console.log("[PaymentWallets] Wallet deleted:", walletId);
    } catch (error) {
      console.error("[PaymentWallets] Error deleting wallet:", error);
      throw error;
    }
  }

  // Get wallet by ID
  async getWalletById(walletId: string) {
    try {
      const wallet = await db
        .select()
        .from(paymentWallets)
        .where(eq(paymentWallets.id, walletId));
      
      return wallet.length > 0 ? wallet[0] : null;
    } catch (error) {
      console.error("[PaymentWallets] Error getting wallet:", error);
      return null;
    }
  }

  // Get live USDT balance for a payment wallet
  async getWalletBalance(walletAddress: string): Promise<number> {
    try {
      const balance = await bep20WalletService.getUSDTBalance(walletAddress);
      return balance;
    } catch (error) {
      console.error("[PaymentWallets] Error getting wallet balance:", error);
      return 0;
    }
  }

  // Auto-forward received USDT to user's personal wallet
  async forwardToPersonalWallet(userId: string, amount: number, walletId: string, sessionId: string) {
    try {
      console.log(`[PaymentWallets] Starting auto-forward for user ${userId}, amount ${amount}`);
      
      // Get user's personal wallet address from userWallets table
      const userWalletRecords = await db
        .select()
        .from(userWallets)
        .where(eq(userWallets.userId, userId));

      console.log(`[PaymentWallets] Found ${userWalletRecords.length} wallet records for user ${userId}`);

      if (userWalletRecords.length === 0) {
        console.error("[PaymentWallets] User wallet not found:", userId);
        return;
      }

      const userPersonalWallet = userWalletRecords[0].address;
      if (!userPersonalWallet) {
        console.error("[PaymentWallets] User has no personal wallet address:", userId);
        return;
      }

      // Get payment wallet seed phrase
      const wallet = await db
        .select()
        .from(paymentWallets)
        .where(eq(paymentWallets.id, walletId));

      if (wallet.length === 0) {
        console.error("[PaymentWallets] Payment wallet not found:", walletId);
        return;
      }

      const seedPhrase = wallet[0].seedPhrase;

      console.log(
        `[PaymentWallets] Auto-forwarding ${amount} USDT from payment wallet ${wallet[0].address} to personal wallet ${userPersonalWallet}`
      );

      // Send USDT using the BEP20 service
      const sendResult = await bep20WalletService.sendUSDT(seedPhrase, userPersonalWallet, amount);

      console.log(`[PaymentWallets] ✅ USDT forwarded! Hash: ${sendResult.hash}`);

      // Update session to completed
      await db
        .update(paymentSessions)
        .set({
          status: "completed",
          completedAt: new Date(),
        })
        .where(eq(paymentSessions.id, sessionId));

      // Release payment wallet
      await this.releaseWallet(walletId);

      console.log(`[PaymentWallets] ✅ Successfully forwarded ${amount} USDT to user ${userId} and released wallet`);

      return {
        success: true,
        amount,
        userId,
        txHash: sendResult.hash,
      };
    } catch (error) {
      console.error("[PaymentWallets] ❌ Error forwarding to personal wallet:", error);
      throw error;
    }
  }

  // Get session status
  async getSessionStatus(sessionId: string) {
    try {
      const session = await db
        .select()
        .from(paymentSessions)
        .where(eq(paymentSessions.id, sessionId));

      if (session.length === 0) throw new Error("Session not found");

      const s = session[0];
      return {
        id: s.id,
        status: s.status,
        receivedUsdtAmount: s.receivedUsdtAmount,
        expectedUsdtAmount: s.expectedUsdtAmount,
        completedAt: s.completedAt,
        expiresAt: s.expiresAt,
        createdAt: s.createdAt,
      };
    } catch (error) {
      console.error("[PaymentWallets] Error getting session status:", error);
      throw error;
    }
  }
}

export const paymentWalletsService = new PaymentWalletsService();
