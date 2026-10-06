import { db } from "./db";
import { productPaymentWallets } from "../shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { randomUUID } from "crypto";

export class ProductPaymentWalletsService {
  // Helper: Update payment link with amount
  updatePaymentLinkWithAmount(basePaymentLink: string, amount: number): string {
    try {
      const url = new URL(basePaymentLink);
      url.searchParams.set("fiatAmount", amount.toString());
      return url.toString();
    } catch (error) {
      console.error("[ProductPaymentWallets] Error updating payment link:", error);
      return basePaymentLink;
    }
  }

  // Admin: Add a new product payment wallet
  async addProductPaymentWallet(address: string, seedPhrase: string, paymentLink: string) {
    try {
      const existing = await db.select().from(productPaymentWallets).where(eq(productPaymentWallets.address, address));
      if (existing.length > 0) {
        throw new Error("Wallet address already exists");
      }

      const result = await db.insert(productPaymentWallets).values({
        address,
        seedPhrase,
        paymentLink,
        status: "idle",
      }).returning();

      return result[0];
    } catch (error) {
      console.error("[ProductPaymentWallets] Error adding wallet:", error);
      throw error;
    }
  }

  // Admin: Get all product payment wallets
  async getAllWallets() {
    try {
      const wallets = await db.select().from(productPaymentWallets);
      
      // Check for expired assignments
      const now = new Date();
      for (const wallet of wallets) {
        if (wallet.status === "in_use" && wallet.expiresAt && wallet.expiresAt < now) {
          await db
            .update(productPaymentWallets)
            .set({
              status: "idle",
              assignedToUserId: null,
              assignedAt: null,
              expiresAt: null,
            })
            .where(eq(productPaymentWallets.id, wallet.id));
          wallet.status = "idle";
          wallet.assignedToUserId = null;
        }
      }

      return wallets;
    } catch (error) {
      console.error("[ProductPaymentWallets] Error getting wallets:", error);
      throw error;
    }
  }

  // User: Get or assign wallet for product purchase
  async getOrAssignWallet(userId: string) {
    try {
      const now = new Date();
      const expiry = new Date(now.getTime() + 20 * 60000); // 20 minutes

      // CLEANUP: First, check all wallets and free up any that have expired
      const allWallets = await db.select().from(productPaymentWallets);
      for (const wallet of allWallets) {
        if (wallet.status === "in_use" && wallet.expiresAt && wallet.expiresAt < now) {
          console.log(`[ProductPaymentWallets] Auto-releasing expired wallet: ${wallet.address}`);
          await db
            .update(productPaymentWallets)
            .set({
              status: "idle",
              assignedToUserId: null,
              assignedAt: null,
              expiresAt: null,
            })
            .where(eq(productPaymentWallets.id, wallet.id));
        }
      }

      // Check if user already has an ACTIVE assignment
      const existing = await db
        .select()
        .from(productPaymentWallets)
        .where(
          and(
            eq(productPaymentWallets.assignedToUserId, userId),
            eq(productPaymentWallets.status, "in_use"),
            sql`${productPaymentWallets.expiresAt} > ${sql.raw(`'${now.toISOString()}'`)}`
          )
        );

      if (existing.length > 0) {
        console.log(`[ProductPaymentWallets] Reusing active wallet for user ${userId}: ${existing[0].address}`);
        return existing[0];
      }

      // Find first idle wallet
      const idleWallets = await db
        .select()
        .from(productPaymentWallets)
        .where(eq(productPaymentWallets.status, "idle"))
        .limit(1);

      if (idleWallets.length === 0) {
        throw new Error("No available product payment wallets. System is in high demand. Wait for a moment.");
      }

      const wallet = idleWallets[0];
      console.log(`[ProductPaymentWallets] Assigning new wallet to user ${userId}: ${wallet.address}`);

      // Assign to user
      const updated = await db
        .update(productPaymentWallets)
        .set({
          status: "in_use",
          assignedToUserId: userId,
          assignedAt: now,
          expiresAt: expiry,
        })
        .where(eq(productPaymentWallets.id, wallet.id))
        .returning();

      return updated[0];
    } catch (error) {
      console.error("[ProductPaymentWallets] Error assigning wallet:", error);
      throw error;
    }
  }

  // Admin: Release wallet manually
  async releaseWallet(walletId: string) {
    try {
      const result = await db
        .update(productPaymentWallets)
        .set({
          status: "idle",
          assignedToUserId: null,
          assignedAt: null,
          expiresAt: null,
        })
        .where(eq(productPaymentWallets.id, walletId))
        .returning();

      return result[0];
    } catch (error) {
      console.error("[ProductPaymentWallets] Error releasing wallet:", error);
      throw error;
    }
  }

  // Admin: Get wallet by ID
  async getWalletById(walletId: string) {
    try {
      const result = await db.select().from(productPaymentWallets).where(eq(productPaymentWallets.id, walletId));
      return result[0] || null;
    } catch (error) {
      console.error("[ProductPaymentWallets] Error getting wallet:", error);
      throw error;
    }
  }

  // Admin: Delete wallet
  async deleteWallet(walletId: string) {
    try {
      await db.delete(productPaymentWallets).where(eq(productPaymentWallets.id, walletId));
      return { success: true };
    } catch (error) {
      console.error("[ProductPaymentWallets] Error deleting wallet:", error);
      throw error;
    }
  }
}

export const productPaymentWalletsService = new ProductPaymentWalletsService();
