import express from "express";
import { paymentWalletsService } from "./payment-wallets-service";
import { storage } from "./storage";

export function registerPaymentWalletsRoutes(app: express.Application) {
  // Middleware
  async function authenticateUser(req: any, res: express.Response, next: express.NextFunction) {
    if (!req.session?.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    req.user = await storage.getUser(req.session.userId);
    next();
  }

  // Admin: Add payment wallet
  app.post("/api/admin/payment-wallets/add", authenticateUser, async (req: any, res) => {
    try {
      const { address, seedPhrase, paymentLink } = req.body;

      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin only" });
      }

      const wallet = await paymentWalletsService.addPaymentWallet(
        address,
        seedPhrase,
        paymentLink
      );

      res.json({ success: true, wallet });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Admin: Get all wallets
  app.get("/api/admin/payment-wallets/list", authenticateUser, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin only" });
      }

      const wallets = await paymentWalletsService.getAllWallets();
      res.json({ wallets });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // User: Get or assign wallet for buying
  app.post("/api/wallet/assign-payment-wallet", authenticateUser, async (req: any, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const { requestedAmount, expectedUsdtAmount } = req.body;

      // Get or assign wallet
      const wallet = await paymentWalletsService.getOrAssignWallet(req.user.id);

      // Create payment session
      const session = await paymentWalletsService.createPaymentSession(
        req.user.id,
        wallet.id,
        requestedAmount,
        expectedUsdtAmount
      );

      // Update payment link with the amount parameter (for dynamic UPI amount in INR)
      const paymentLinkWithAmount = (paymentWalletsService as any).updatePaymentLinkWithAmount(
        wallet.paymentLink,
        requestedAmount
      );

      res.json({
        success: true,
        wallet: {
          address: wallet.address,
          paymentLink: paymentLinkWithAmount,
          merchantOrderNo: (wallet as any).currentMerchantOrderNo, // Return the generated UID
        },
        session,
      });
    } catch (error: any) {
      // Check if error is due to no available wallets
      if (error.message && error.message.includes("No available payment wallets")) {
        return res.status(503).json({ 
          message: "Server is busy. Please try again in a moment.",
          retryAfter: 60
        });
      }
      res.status(400).json({ message: error.message });
    }
  });

  // Check session status
  app.get("/api/wallet/payment-session/:sessionId", authenticateUser, async (req: any, res) => {
    try {
      const sessionId = req.params.sessionId;
      const session = await paymentWalletsService.getSessionStatus(sessionId);
      res.json(session);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Admin: Update payment wallet
  app.put("/api/admin/payment-wallets/:walletId", authenticateUser, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin only" });
      }

      const { address, seedPhrase, paymentLink } = req.body;
      const walletId = req.params.walletId;

      if (!address || !seedPhrase || !paymentLink) {
        return res.status(400).json({ message: "All fields required" });
      }

      const wallet = await paymentWalletsService.updatePaymentWallet(
        walletId,
        address,
        seedPhrase,
        paymentLink
      );

      res.json({ success: true, wallet });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Admin: Delete payment wallet
  app.delete("/api/admin/payment-wallets/:walletId", authenticateUser, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin only" });
      }

      const walletId = req.params.walletId;
      await paymentWalletsService.deleteWallet(walletId);
      res.json({ success: true, message: "Wallet deleted" });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Admin: Clear timer on payment wallet (force release)
  app.post("/api/admin/payment-wallets/:walletId/clear-timer", authenticateUser, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin only" });
      }

      const walletId = req.params.walletId;
      await paymentWalletsService.releaseWallet(walletId);
      res.json({ success: true, message: "Timer cleared and wallet released" });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Get live USDT balance for a payment wallet
  app.get("/api/admin/payment-wallets/:walletId/balance", authenticateUser, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin only" });
      }

      const walletId = req.params.walletId;
      const wallet = await paymentWalletsService.getWalletById(walletId);
      
      if (!wallet) {
        return res.status(404).json({ message: "Wallet not found" });
      }

      const balance = await paymentWalletsService.getWalletBalance(wallet.address);
      res.json({ balance, address: wallet.address });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Admin: Manually record incoming payment (for recovery/testing)
  app.post("/api/admin/payment-wallets/:walletId/record-incoming", authenticateUser, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin only" });
      }

      const { walletId } = req.params;
      const { amount, txHash } = req.body;

      if (!amount || !txHash) {
        return res.status(400).json({ message: "Amount and txHash required" });
      }

      const wallet = await paymentWalletsService.getWalletById(walletId);
      if (!wallet) {
        return res.status(404).json({ message: "Wallet not found" });
      }

      console.log(`[Routes] Admin manually recording payment: ${amount} USDT for wallet ${walletId}`);
      await storage.recordPaymentWalletIncoming(walletId, amount, txHash);
      
      res.json({ success: true, message: "Payment recorded and auto-forward triggered" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
}
