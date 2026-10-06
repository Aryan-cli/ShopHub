import express from "express";
import { productPaymentWalletsService } from "./product-payment-wallets-service";
import { storage } from "./storage";

export function registerProductPaymentWalletsRoutes(app: express.Application) {
  // Middleware
  async function authenticateUser(req: any, res: express.Response, next: express.NextFunction) {
    if (!req.session?.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    req.user = await storage.getUser(req.session.userId);
    next();
  }

  // Admin: Add product payment wallet
  app.post("/api/admin/product-payment-wallets/add", authenticateUser, async (req: any, res) => {
    try {
      const { address, seedPhrase, paymentLink } = req.body;

      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin only" });
      }

      const wallet = await productPaymentWalletsService.addProductPaymentWallet(
        address,
        seedPhrase,
        paymentLink
      );

      res.json({ success: true, wallet });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Admin: Get all product payment wallets
  app.get("/api/admin/product-payment-wallets/list", authenticateUser, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin only" });
      }

      const wallets = await productPaymentWalletsService.getAllWallets();
      res.json({ wallets });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Admin: Delete product payment wallet
  app.delete("/api/admin/product-payment-wallets/:walletId", authenticateUser, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin only" });
      }

      const walletId = req.params.walletId;
      await productPaymentWalletsService.deleteWallet(walletId);
      res.json({ success: true, message: "Wallet deleted" });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Admin: Release product payment wallet
  app.post("/api/admin/product-payment-wallets/:walletId/release", authenticateUser, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin only" });
      }

      const walletId = req.params.walletId;
      const wallet = await productPaymentWalletsService.releaseWallet(walletId);
      res.json({ success: true, message: "Wallet released", wallet });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });
}
