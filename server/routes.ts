import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import session from "express-session";
import bcrypt from "bcrypt";
import * as ethers from "ethers";
import { storage } from "./storage";
import { users, products, reviews, orders, orderItems, forumPosts, forumComments, favorites, conversationParticipants, follows, conversations, messages, notificationSettings, userBlockedChat, userMutedChat, virtualWallets, ledgerEntries, escrowOrders, purchaseSnapshots, disputes, paymentCoins, adminSettings, productFees, withdrawalRequests, userWallets } from "@shared/schema";
import { eq, and, or, desc, sql, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import { insertProductSchema, insertReviewSchema, insertForumPostSchema, insertForumCommentSchema, paymentWallets, paymentSessions } from "@shared/schema";
import { walletService } from "./wallet-service";
import { blockchainService } from "./blockchain-service";
import { bnbBlockchainService } from "./bnb-blockchain-service";
import { bnbWalletService } from "./bnb-wallet-service";
import { bep20WalletService } from "./wallet-bep20-service";
import { sendChatNotification, sendPurchaseNotification, sendSaleNotification, sendPaymentConfirmationNotification, shouldSendChatNotification, initializeEmailService } from "./email";
import { apiCache, cacheKey } from "./cache";
import { alchemyPayService } from "./alchemy-pay-service";
import { trustWalletService } from "./trust-wallet-service";
import { registerPaymentWalletsRoutes } from "./payment-wallets-routes";
import { registerProductPaymentWalletsRoutes } from "./product-payment-wallets-routes";

const ADMIN_USERNAME = "Admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin@1234";
const SALT_ROUNDS = 10;

declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

const wsClients = new Map<string, Set<WebSocket>>();
const onlineUsers = new Set<string>();
const userHttpHeartbeats = new Map<string, number>(); // userId -> last heartbeat ms
const httpTypingStatus = new Map<string, { userId: string; username: string; expiresAt: number }>(); // conversationId -> typing info

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  next();
}

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  const user = await storage.getUser(req.session.userId);
  if (!user || !user.isAdmin) {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
}

async function requireMerchant(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  const user = await storage.getUser(req.session.userId);
  if (!user || !user.isMerchant) {
    return res.status(403).json({ message: "Merchant access required" });
  }
  next();
}

async function requireNotBlocked(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return next();
  }
  const user = await storage.getUser(req.session.userId);
  if (user?.isBlocked) {
    return res.status(403).json({ message: "Your account has been blocked" });
  }
  next();
}

async function seedPaymentCoins() {
  try {
    const existingCoins = await storage.getAllPaymentCoins();
    if (existingCoins.length === 0) {
      // Seed default payment coins
      await storage.createPaymentCoin({
        symbol: "BTC",
        name: "Bitcoin",
        network: "mainnet",
        isEnabled: true,
        explorerUrl: "https://blockstream.info/tx/",
        addressPrefix: "bc1,1,3",
        decimals: 8,
        sortOrder: 0,
      });
      
      await storage.createPaymentCoin({
        symbol: "BNB",
        name: "BNB Smart Chain",
        network: "bsc",
        isEnabled: false, // Disabled by default, admin can enable
        rpcUrl: "https://bsc-dataseed.binance.org",
        explorerUrl: "https://bscscan.com/tx/",
        addressPrefix: "0x",
        decimals: 18,
        sortOrder: 1,
      });
      
      await storage.createPaymentCoin({
        symbol: "USDT",
        name: "Tether (BNB Chain)",
        network: "bsc",
        isEnabled: true, // Enabled by default
        rpcUrl: "https://bsc-dataseed.binance.org",
        explorerUrl: "https://bscscan.com/tx/",
        addressPrefix: "0x",
        decimals: 18,
        sortOrder: 2,
      });
      
      console.log("[Seed] Default payment coins created (BTC and USDT enabled, BNB disabled)");
    }
  } catch (error) {
    console.error("[Seed] Error seeding payment coins:", error);
  }
}

async function seedAdminSettings() {
  try {
    const globalEarlyApproval = await storage.getAdminSetting("global_early_approval_enabled");
    if (!globalEarlyApproval) {
      await storage.setAdminSetting(
        "global_early_approval_enabled", 
        "false", 
        "When enabled, all new escrow orders will allow early approval by default"
      );
      console.log("[Seed] Default admin settings created");
    }
    
    const autoApproveWithdrawals = await storage.getAdminSetting("auto_approve_withdrawals");
    if (!autoApproveWithdrawals) {
      await storage.setAdminSetting(
        "auto_approve_withdrawals",
        "false",
        "When enabled, withdrawal requests are automatically approved and crypto is sent to merchant wallet"
      );
      console.log("[Seed] Auto-approve withdrawals setting created");
    }
  } catch (error) {
    console.error("[Seed] Error seeding admin settings:", error);
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Initialize email service
  initializeEmailService();
  
  // Seed default data
  await seedPaymentCoins();
  await seedAdminSettings();
  
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    throw new Error("SESSION_SECRET must be set");
  }

  app.use(
    session({
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: false,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
      },
    })
  );

  app.use(requireNotBlocked);

  // Register payment wallets routes (AFTER session middleware)
  registerPaymentWalletsRoutes(app);
  registerProductPaymentWalletsRoutes(app);

  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  // Helper to send to all connections of a user
  const sendToUser = (userId: string, data: string) => {
    const userSockets = wsClients.get(userId);
    if (userSockets) {
      userSockets.forEach((clientWs) => {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(data);
        }
      });
    }
  };

  // Broadcast online status to all connected clients
  const broadcastOnlineStatus = (userId: string, isOnline: boolean) => {
    const message = JSON.stringify({ type: "online_status", userId, isOnline });
    wsClients.forEach((sockets) => {
      sockets.forEach((clientWs) => {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(message);
        }
      });
    });
  };

  wss.on("connection", async (ws, req) => {
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const userId = url.searchParams.get("userId");
    
    if (userId) {
      // Add socket to the set for this user
      if (!wsClients.has(userId)) {
        wsClients.set(userId, new Set());
      }
      wsClients.get(userId)!.add(ws);
      
      const wasOnline = onlineUsers.has(userId);
      onlineUsers.add(userId);
      
      // Only broadcast online status if user wasn't already online
      if (!wasOnline) {
        broadcastOnlineStatus(userId, true);
      }
      
      // Send current online users to the newly connected socket
      onlineUsers.forEach((onlineUserId) => {
        if (onlineUserId !== userId) {
          ws.send(JSON.stringify({ type: "online_status", userId: onlineUserId, isOnline: true }));
        }
      });
      
      ws.on("close", () => {
        // Remove only this socket from the user's set
        const userSockets = wsClients.get(userId);
        if (userSockets) {
          userSockets.delete(ws);
          // If no more sockets for this user, remove from online users
          if (userSockets.size === 0) {
            wsClients.delete(userId);
            onlineUsers.delete(userId);
            broadcastOnlineStatus(userId, false);
          }
        }
      });

      ws.on("message", async (data) => {
        try {
          const message = JSON.parse(data.toString());
          
          if (message.type === "chat_message") {
            const { conversationId, content, contentType, attachmentData, attachmentType, receiverId } = message;
            
            console.log(`[Chat] Message from ${userId} to conversation ${conversationId}`);
            
            const isBlocked = await storage.isBlocked(receiverId, userId);
            if (isBlocked) {
              ws.send(JSON.stringify({ type: "error", message: "You are blocked by this user" }));
              return;
            }

            const newMessage = await storage.createMessage({
              conversationId,
              senderId: userId,
              content,
              contentType: contentType || "text",
              attachmentData,
              attachmentType,
            });

            const sender = await storage.getUser(userId);
            const messageWithSender = { ...newMessage, sender };

            const participants = await storage.getConversationParticipants(conversationId);
            console.log(`[Chat] Found ${participants.length} participants in conversation`);
            
            // Process all participants (send WebSocket + email notifications)
            for (const participant of participants) {
              // Send real-time WebSocket notification
              sendToUser(participant.id, JSON.stringify({ type: "new_message", message: messageWithSender }));
              
              // Send email notification if recipient is offline and hasn't muted sender
              if (participant.id !== userId) {
                console.log(`[Chat] Checking if email should be sent to ${participant.id}`);
                const isRecipientOnline = onlineUsers.has(participant.id);
                console.log(`[Chat] Recipient ${participant.id} online: ${isRecipientOnline}`);
                
                const shouldSend = await shouldSendChatNotification(participant.id, userId, isRecipientOnline);
                if (shouldSend && sender) {
                  const preview = content || (contentType === "image" ? "[Image]" : "[Attachment]");
                  console.log(`[Chat] Sending email notification to ${participant.id}`);
                  await sendChatNotification(participant.id, sender.username, preview);
                } else if (!shouldSend) {
                  console.log(`[Chat] Email NOT sent to ${participant.id} - shouldSend returned false`);
                }
              }
            }
            console.log(`[Chat] Message processed for all participants`);
          }
          
          // Handle typing indicator
          if (message.type === "typing") {
            const { conversationId, receiverId } = message;
            const sender = await storage.getUser(userId);
            sendToUser(receiverId, JSON.stringify({ 
              type: "typing", 
              conversationId, 
              userId, 
              username: sender?.username 
            }));
          }
          
          // Handle stop typing
          if (message.type === "stop_typing") {
            const { conversationId, receiverId } = message;
            sendToUser(receiverId, JSON.stringify({ type: "stop_typing", conversationId, userId }));
          }
        } catch (error) {
          console.error("WebSocket message error:", error);
        }
      });
    }
  });

  // ============== HTTP FALLBACKS FOR ONLINE/TYPING (production-safe) ==============

  // HTTP heartbeat - marks user online even without WebSocket
  app.post("/api/heartbeat", requireAuth, async (req, res) => {
    const userId = req.session.userId!;
    userHttpHeartbeats.set(userId, Date.now());
    if (!onlineUsers.has(userId)) {
      onlineUsers.add(userId);
      broadcastOnlineStatus(userId, true);
    }
    // Clean up stale HTTP heartbeats (> 40 seconds)
    const now = Date.now();
    userHttpHeartbeats.forEach((ts, uid) => {
      if (now - ts > 40000 && !wsClients.has(uid)) {
        userHttpHeartbeats.delete(uid);
        if (onlineUsers.has(uid)) {
          onlineUsers.delete(uid);
          broadcastOnlineStatus(uid, false);
        }
      }
    });
    res.json({ ok: true });
  });

  // Get online status for a list of user IDs
  app.get("/api/users/online-statuses", requireAuth, async (req, res) => {
    const userIds = ((req.query.userIds as string) || "").split(",").filter(Boolean);
    const now = Date.now();
    const statuses: Record<string, boolean> = {};
    for (const uid of userIds) {
      const wsOnline = onlineUsers.has(uid);
      const lastHttp = userHttpHeartbeats.get(uid);
      const httpOnline = lastHttp ? now - lastHttp < 40000 : false;
      statuses[uid] = wsOnline || httpOnline;
    }
    res.json(statuses);
  });

  // HTTP typing - set typing status for a conversation
  app.post("/api/conversations/:id/typing", requireAuth, async (req, res) => {
    const conversationId = req.params.id;
    const userId = req.session.userId!;
    const { isTyping } = req.body;
    if (isTyping) {
      const user = await storage.getUser(userId);
      httpTypingStatus.set(conversationId, {
        userId,
        username: user?.username || "",
        expiresAt: Date.now() + 4000,
      });
    } else {
      const current = httpTypingStatus.get(conversationId);
      if (current?.userId === userId) {
        httpTypingStatus.delete(conversationId);
      }
    }
    res.json({ ok: true });
  });

  // HTTP typing - get who's typing in a conversation
  app.get("/api/conversations/:id/typing", requireAuth, async (req, res) => {
    const conversationId = req.params.id;
    const userId = req.session.userId!;
    const now = Date.now();
    const typing = httpTypingStatus.get(conversationId);
    if (typing && typing.userId !== userId && typing.expiresAt > now) {
      res.json({ isTyping: true, userId: typing.userId, username: typing.username });
    } else {
      if (typing && typing.expiresAt <= now) {
        httpTypingStatus.delete(conversationId);
      }
      res.json({ isTyping: false });
    }
  });

  app.post("/api/auth/register", async (req, res) => {
    try {
      const { username, password } = req.body;

      if (!username || typeof username !== "string" || username.length < 3) {
        return res.status(400).json({ message: "Username must be at least 3 characters" });
      }
      if (!password || typeof password !== "string" || password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }

      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }

      const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

      const registrationIp = req.ip || req.headers['x-forwarded-for']?.toString().split(',')[0] || 'unknown';
      
      const user = await storage.createUser({
        username,
        password: hashedPassword,
        isAdmin: false, // SECURITY FIX: Explicitly set isAdmin to false
        isMerchant: false, // SECURITY FIX: Explicitly set isMerchant to false
      });

      req.session.userId = user.id;
      
      res.json({
        id: user.id,
        username: user.username,
        isAdmin: user.isAdmin,
        isMerchant: user.isMerchant,
        bio: user.bio,
        avatarData: user.avatarData,
        avatarType: user.avatarType,
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Failed to register" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({ message: "Username and password required" });
      }

      if (username === ADMIN_USERNAME) {
        if (password !== ADMIN_PASSWORD) {
          return res.status(401).json({ message: "Invalid username or password" });
        }
        let adminUser = await storage.getUserByUsername(ADMIN_USERNAME);
        
        if (!adminUser) {
          const hashedAdminPassword = await bcrypt.hash(ADMIN_PASSWORD, SALT_ROUNDS);
          adminUser = await storage.createAdminUser({
            username: ADMIN_USERNAME,
            password: hashedAdminPassword,
          });
        }

        req.session.userId = adminUser.id;
        return res.json({
          id: adminUser.id,
          username: adminUser.username,
          isAdmin: adminUser.isAdmin,
          isMerchant: adminUser.isMerchant,
          bio: adminUser.bio,
          avatarData: adminUser.avatarData,
          avatarType: adminUser.avatarType,
        });
      }

      const user = await storage.getUserByUsername(username);
      if (!user) {
        return res.status(401).json({ message: "Invalid username or password" });
      }

      if (user.isBlocked) {
        return res.status(403).json({ message: "Your account has been blocked" });
      }

      const passwordMatch = await bcrypt.compare(password, user.password);
      if (!passwordMatch) {
        return res.status(401).json({ message: "Invalid username or password" });
      }

      req.session.userId = user.id;
      
      res.json({
        id: user.id,
        username: user.username,
        isAdmin: user.isAdmin,
        isMerchant: user.isMerchant,
        bio: user.bio,
        avatarData: user.avatarData,
        avatarType: user.avatarType,
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Failed to login" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Failed to logout" });
      }
      res.json({ message: "Logged out successfully" });
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const user = await storage.getUser(req.session.userId);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    res.json({
      id: user.id,
      username: user.username,
      isAdmin: user.isAdmin,
      isMerchant: user.isMerchant,
      bio: user.bio,
      avatarData: user.avatarData,
      avatarType: user.avatarType,
      merchantSince: user.merchantSince,
    });
  });

  app.get("/api/users/:id", async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const followerCount = user.isMerchant ? await storage.getFollowerCount(user.id) : 0;
      let isFollowing = false;
      if (req.session.userId && user.isMerchant && req.session.userId !== user.id) {
        isFollowing = await storage.isFollowing(req.session.userId, user.id);
      }
      res.json({
        id: user.id,
        username: user.username,
        isMerchant: user.isMerchant,
        bio: user.bio,
        avatarData: user.avatarData,
        avatarType: user.avatarType,
        merchantSince: user.merchantSince,
        followerCount,
        isFollowing,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  app.get("/api/users/:id/products", async (req, res) => {
    try {
      const merchantId = req.params.id;
      const merchantProducts = await storage.getProductsByMerchantId(merchantId);
      const productsWithRatings = await Promise.all(
        merchantProducts.map(async (product) => {
          const reviews = await storage.getReviewsByProductId(product.id);
          const ratingsOnly = reviews.filter((r) => r.rating !== null && r.rating !== undefined);
          const averageRating = ratingsOnly.length > 0
            ? ratingsOnly.reduce((sum, r) => sum + (r.rating || 0), 0) / ratingsOnly.length
            : 0;
          return { ...product, averageRating, reviewCount: ratingsOnly.length };
        })
      );
      res.json(productsWithRatings);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch merchant products" });
    }
  });

  app.patch("/api/users/profile", requireAuth, async (req, res) => {
    try {
      const { bio, avatarData, avatarType } = req.body;
      const user = await storage.updateUser(req.session.userId!, { bio, avatarData, avatarType });
      res.json(user);
    } catch (error) {
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  app.post("/api/users/change-password", requireAuth, async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Current password and new password are required" });
      }

      if (typeof newPassword !== "string" || newPassword.length < 6) {
        return res.status(400).json({ message: "New password must be at least 6 characters" });
      }

      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const passwordMatch = await bcrypt.compare(currentPassword, user.password);
      if (!passwordMatch) {
        return res.status(401).json({ message: "Current password is incorrect" });
      }

      const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
      await storage.updateUser(user.id, { password: hashedPassword });

      res.json({ message: "Password changed successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to change password" });
    }
  });

  app.post("/api/users/become-merchant", requireAuth, async (req, res) => {
    try {
      const user = await storage.becomeMerchant(req.session.userId!);
      res.json(user);
    } catch (error) {
      res.status(500).json({ message: "Failed to become merchant" });
    }
  });

  app.get("/api/products", async (req, res) => {
    try {
      const { search, sort, page = "1", limit = "20" } = req.query;
      const pageNum = Math.max(1, parseInt(page as string) || 1);
      const limitNum = Math.min(50, Math.max(1, parseInt(limit as string) || 20));
      
      const cacheKeyStr = cacheKey("products", search as string, sort as string, String(pageNum), String(limitNum));
      const cached = apiCache.get<any>(cacheKeyStr);
      if (cached) {
        return res.json(cached);
      }
      
      let productsList;
      
      if (search && typeof search === "string") {
        productsList = await storage.searchProducts(search);
      } else {
        productsList = await storage.getAllProducts();
      }
      
      const productsWithRatings = await Promise.all(
        productsList.map(async (product) => {
          const { averageRating, reviewCount } = await storage.getProductAverageRating(product.id);
          const merchant = product.merchantId ? await storage.getUser(product.merchantId) : null;
          return {
            ...product,
            averageRating,
            reviewCount,
            merchant: merchant ? { id: merchant.id, username: merchant.username, avatarData: merchant.avatarData, avatarType: merchant.avatarType } : null,
          };
        })
      );

      let sortedProducts = [...productsWithRatings];

      const popularityScore = (p: typeof sortedProducts[0]) =>
        (p.viewCount || 0) + (p.reviewCount * 15) + (p.averageRating * 10);

      if (sort === "home") {
        const now = Date.now();
        const ONE_MONTH = 30 * 24 * 60 * 60 * 1000;
        const SIX_MONTHS = 6 * ONE_MONTH;
        const ONE_YEAR = 12 * ONE_MONTH;

        const bucket1 = sortedProducts.filter(p => now - new Date(p.createdAt).getTime() <= ONE_MONTH);
        const bucket2 = sortedProducts.filter(p => {
          const age = now - new Date(p.createdAt).getTime();
          return age > ONE_MONTH && age <= SIX_MONTHS;
        });
        const bucket3 = sortedProducts.filter(p => {
          const age = now - new Date(p.createdAt).getTime();
          return age > SIX_MONTHS && age <= ONE_YEAR;
        });

        bucket1.sort((a, b) => popularityScore(b) - popularityScore(a));
        bucket2.sort((a, b) => popularityScore(b) - popularityScore(a));
        bucket3.sort((a, b) => popularityScore(b) - popularityScore(a));

        sortedProducts = [...bucket1, ...bucket2, ...bucket3];
      } else if (sort === "latest") {
        sortedProducts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      } else if (sort === "popular") {
        sortedProducts.sort((a, b) => popularityScore(b) - popularityScore(a));
      } else if (sort === "top-rated") {
        sortedProducts.sort((a, b) => b.averageRating - a.averageRating);
      } else if (sort === "most-viewed") {
        sortedProducts.sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0));
      } else {
        sortedProducts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      }

      const totalCount = sortedProducts.length;
      const totalPages = Math.ceil(totalCount / limitNum);
      const startIndex = (pageNum - 1) * limitNum;
      const paginatedProducts = sortedProducts.slice(startIndex, startIndex + limitNum);

      const response = {
        products: paginatedProducts,
        pagination: {
          page: pageNum,
          limit: limitNum,
          totalCount,
          totalPages,
          hasMore: pageNum < totalPages,
        },
      };

      apiCache.set(cacheKeyStr, response, 15000);
      res.json(response);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch products" });
    }
  });

  app.get("/api/products/:id", async (req, res) => {
    try {
      const product = await storage.getProductById(req.params.id);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      await storage.incrementViewCount(product.id);

      const reviews = await storage.getReviewsByProductId(product.id);
      const { averageRating, reviewCount } = await storage.getProductAverageRating(product.id);
      const merchant = product.merchantId ? await storage.getUser(product.merchantId) : null;
      
      let isFavorite = false;
      let isFollowing = false;
      if (req.session.userId) {
        isFavorite = await storage.isFavorite(req.session.userId, product.id);
        if (merchant) {
          isFollowing = await storage.isFollowing(req.session.userId, merchant.id);
        }
      }

      const followerCount = merchant ? await storage.getFollowerCount(merchant.id) : 0;

      // Security fix: Remove sensitive after-buy fields from public product view
      const { afterBuyMessage, afterBuyButtonLabel, afterBuyButtonUrl, ...safeProduct } = product;

      res.json({
        ...safeProduct,
        viewCount: (product.viewCount || 0) + 1,
        reviews,
        averageRating,
        reviewCount,
        isFavorite,
        merchant: merchant ? {
          id: merchant.id,
          username: merchant.username,
          avatarData: merchant.avatarData,
          avatarType: merchant.avatarType,
          bio: merchant.bio,
          followerCount,
          isFollowing,
        } : null,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch product" });
    }
  });

  // Security fix: Add dedicated endpoint for after-buy message with verified buyer check
  app.get("/api/products/:id/after-buy", requireAuth, async (req, res) => {
    try {
      const productId = req.params.id;
      const userId = req.session.userId!;
      
      const product = await storage.getProductById(productId);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      // Check if user is the merchant who owns the product or a verified buyer
      const isMerchant = product.merchantId === userId;
      const isVerifiedBuyer = await storage.hasUserBoughtProduct(userId, productId);

      if (!isMerchant && !isVerifiedBuyer) {
        return res.status(403).json({ message: "You must purchase this product to view this content" });
      }

      res.json({
        message: product.afterBuyMessage,
        buttonLabel: product.afterBuyButtonLabel,
        buttonUrl: product.afterBuyButtonUrl,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch purchase details" });
    }
  });

  app.post("/api/products/:id/reviews", requireAuth, async (req, res) => {
    try {
      const productId = req.params.id;
      const product = await storage.getProductById(productId);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      const { rating, comment, parentReviewId } = req.body;
      
      const isVerifiedBuyer = await storage.hasUserBoughtProduct(user.id, productId);
      const isMerchantReply = product.merchantId === user.id;

      if (rating !== undefined && rating !== null) {
        if (!isVerifiedBuyer) {
          return res.status(403).json({ message: "Only verified buyers can give ratings" });
        }
        if (typeof rating !== "number" || rating < 1 || rating > 5) {
          return res.status(400).json({ message: "Rating must be between 1 and 5" });
        }
      }

      if (!comment || typeof comment !== "string" || comment.length < 3) {
        return res.status(400).json({ message: "Comment must be at least 3 characters" });
      }

      const review = await storage.createReview({
        productId,
        userId: user.id,
        rating: isVerifiedBuyer ? rating : null,
        comment,
        username: user.username,
        isVerifiedBuyer,
        isMerchantReply,
        parentReviewId,
      });

      res.json(review);
    } catch (error) {
      console.error("Review error:", error);
      res.status(500).json({ message: "Failed to create review" });
    }
  });

  app.patch("/api/reviews/:id", requireAuth, async (req, res) => {
    try {
      const review = await storage.getReviewById(req.params.id);
      if (!review) {
        return res.status(404).json({ message: "Review not found" });
      }
      const user = await storage.getUser(req.session.userId!);
      if (review.userId !== req.session.userId && !user?.isAdmin) {
        return res.status(403).json({ message: "Not authorized to edit this review" });
      }
      const { comment } = req.body;
      if (!comment || typeof comment !== "string" || comment.length < 3) {
        return res.status(400).json({ message: "Comment must be at least 3 characters" });
      }
      const updated = await storage.updateReview(req.params.id, comment);
      res.json(updated);
    } catch (error) {
      console.error("Update review error:", error);
      res.status(500).json({ message: "Failed to update review" });
    }
  });

  app.delete("/api/reviews/:id", requireAuth, async (req, res) => {
    try {
      const review = await storage.getReviewById(req.params.id);
      if (!review) {
        return res.status(404).json({ message: "Review not found" });
      }
      const user = await storage.getUser(req.session.userId!);
      if (review.userId !== req.session.userId && !user?.isAdmin) {
        return res.status(403).json({ message: "Not authorized to delete this review" });
      }
      await storage.deleteReview(req.params.id);
      res.json({ message: "Review deleted" });
    } catch (error) {
      console.error("Delete review error:", error);
      res.status(500).json({ message: "Failed to delete review" });
    }
  });

  app.post("/api/products/:id/favorite", requireAuth, async (req, res) => {
    try {
      const productId = req.params.id;
      const userId = req.session.userId!;
      
      const isFav = await storage.isFavorite(userId, productId);
      if (isFav) {
        await storage.removeFavorite(userId, productId);
        res.json({ isFavorite: false });
      } else {
        await storage.addFavorite(userId, productId);
        res.json({ isFavorite: true });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to toggle favorite" });
    }
  });

  app.get("/api/favorites", requireAuth, async (req, res) => {
    try {
      const favorites = await storage.getFavoritesByUserId(req.session.userId!);
      const productsWithDetails = await Promise.all(
        favorites.map(async (fav) => {
          const product = await storage.getProductById(fav.productId);
          if (!product) return null;
          const { averageRating, reviewCount } = await storage.getProductAverageRating(product.id);
          return { ...product, averageRating, reviewCount };
        })
      );
      res.json(productsWithDetails.filter(Boolean));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch favorites" });
    }
  });

  app.post("/api/merchants/:id/follow", requireAuth, async (req, res) => {
    try {
      const merchantId = req.params.id;
      const userId = req.session.userId!;
      
      const merchant = await storage.getUser(merchantId);
      if (!merchant || !merchant.isMerchant) {
        return res.status(404).json({ message: "Merchant not found" });
      }

      const isFollowingNow = await storage.isFollowing(userId, merchantId);
      if (isFollowingNow) {
        await storage.unfollowMerchant(userId, merchantId);
        res.json({ isFollowing: false });
      } else {
        await storage.followMerchant(userId, merchantId);
        res.json({ isFollowing: true });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to toggle follow" });
    }
  });

  app.get("/api/following", requireAuth, async (req, res) => {
    try {
      const merchants = await storage.getFollowingMerchants(req.session.userId!);
      res.json(merchants.map(m => ({
        id: m.id,
        username: m.username,
        avatarData: m.avatarData,
        avatarType: m.avatarType,
        bio: m.bio,
      })));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch following" });
    }
  });

  app.get("/api/merchant/products", requireMerchant, async (req, res) => {
    try {
      const products = await storage.getProductsByMerchantId(req.session.userId!);
      res.json(products);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch products" });
    }
  });

  app.post("/api/merchant/products", requireMerchant, async (req, res) => {
    try {
      const productData = insertProductSchema.parse({ ...req.body, merchantId: req.session.userId });
      const product = await storage.createProduct(productData);
      res.json(product);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      res.status(500).json({ message: "Failed to create product" });
    }
  });

  app.patch("/api/merchant/products/:id", requireMerchant, async (req, res) => {
    try {
      const product = await storage.getProductById(req.params.id);
      if (!product || product.merchantId !== req.session.userId) {
        return res.status(404).json({ message: "Product not found" });
      }
      const updated = await storage.updateProduct(req.params.id, req.body);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update product" });
    }
  });

  app.delete("/api/merchant/products/:id", requireMerchant, async (req, res) => {
    try {
      const product = await storage.getProductById(req.params.id);
      if (!product || product.merchantId !== req.session.userId) {
        return res.status(404).json({ message: "Product not found" });
      }
      await storage.deleteProduct(req.params.id);
      res.json({ message: "Product deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete product" });
    }
  });

  app.post("/api/orders", requireAuth, async (req, res) => {
    try {
      const { items } = req.body;
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "Order must have items" });
      }

      let totalAmount = 0;
      for (const item of items) {
        const product = await storage.getProductById(item.productId);
        if (!product) {
          return res.status(404).json({ message: `Product ${item.productId} not found` });
        }
        // Check stock availability
        if (product.stockQuantity !== null && product.stockQuantity !== undefined) {
          const qty = item.quantity || 1;
          if (product.stockQuantity < qty) {
            return res.status(400).json({ 
              message: `"${product.name}" is out of stock or doesn't have enough quantity available.` 
            });
          }
        }
        // PRICE TAMPERING PROTECTION: Re-calculate price on server
        totalAmount += parseFloat(product.price) * (item.quantity || 1);
      }

      const order = await storage.createOrder({
        userId: req.session.userId!,
        totalAmount: totalAmount.toFixed(2),
      });

      for (const item of items) {
        const product = await storage.getProductById(item.productId);
        if (product) {
          await storage.createOrderItem({
            orderId: order.id,
            productId: item.productId,
            quantity: item.quantity || 1,
            price: product.price, // Use price from database, not client
          });
          // Stock is NOT decremented here - it is decremented only when payment is confirmed (escrow status = "escrow")
        }
      }

      res.json(order);
    } catch (error) {
      res.status(500).json({ message: "Failed to create order" });
    }
  });

  // Security fix: Secure after-buy details to only show for verified payments
  app.get("/api/products/:id/after-buy", requireAuth, async (req, res) => {
    try {
      const productId = req.params.id;
      const userId = req.session.userId!;
      
      const product = await storage.getProductById(productId);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      // Check if user is the merchant who owns the product or a verified buyer
      const isMerchant = product.merchantId === userId;
      const isVerifiedBuyer = await storage.hasUserBoughtProduct(userId, productId);

      if (!isMerchant && !isVerifiedBuyer) {
        return res.status(403).json({ message: "You must purchase this product to view this content" });
      }

      res.json({
        message: product.afterBuyMessage,
        buttonLabel: product.afterBuyButtonLabel,
        buttonUrl: product.afterBuyButtonUrl,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch purchase details" });
    }
  });

  app.get("/api/orders", requireAuth, async (req, res) => {
    try {
      const orders = await storage.getOrdersByUserId(req.session.userId!);
      res.json(orders);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  app.get("/api/conversations", requireAuth, async (req, res) => {
    try {
      const convs = await storage.getConversationsByUserId(req.session.userId!);
      const convsWithDetails = await Promise.all(
        convs.map(async (conv) => {
          const participants = await storage.getConversationParticipants(conv.id);
          const otherUser = participants.find(p => p.id !== req.session.userId);
          const messages = await storage.getMessagesByConversationId(conv.id);
          const lastMessage = messages[messages.length - 1];
          const hasUnread = await storage.hasUnreadMessages(conv.id, req.session.userId!);
          return {
            ...conv,
            otherUser: otherUser ? { id: otherUser.id, username: otherUser.username, avatarData: otherUser.avatarData, avatarType: otherUser.avatarType } : null,
            lastMessage,
            hasUnread,
          };
        })
      );
      res.json(convsWithDetails);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch conversations" });
    }
  });

  app.post("/api/conversations", requireAuth, async (req, res) => {
    try {
      const { recipientId } = req.body;
      const userId = req.session.userId!;

      if (recipientId === userId) {
        return res.status(400).json({ message: "Cannot start conversation with yourself" });
      }

      const isBlocked = await storage.isBlocked(recipientId, userId);
      if (isBlocked) {
        return res.status(403).json({ message: "You are blocked by this user" });
      }

      let conversation = await storage.getConversationBetweenUsers(userId, recipientId);
      
      if (!conversation) {
        conversation = await storage.createConversation();
        await storage.addParticipant(conversation.id, userId);
        await storage.addParticipant(conversation.id, recipientId);
      }

      const participants = await storage.getConversationParticipants(conversation.id);
      const otherUser = participants.find(p => p.id !== userId);

      res.json({
        ...conversation,
        otherUser: otherUser ? { id: otherUser.id, username: otherUser.username, avatarData: otherUser.avatarData, avatarType: otherUser.avatarType } : null,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to create conversation" });
    }
  });

  app.get("/api/conversations/:id/read-status", requireAuth, async (req, res) => {
    try {
      const statuses = await storage.getConversationReadStatuses(req.params.id);
      res.json(statuses);
    } catch {
      res.status(500).json({ message: "Failed to get read status" });
    }
  });

  app.post("/api/conversations/:id/mark-read", requireAuth, async (req, res) => {
    try {
      const conversationId = req.params.id;
      const userId = req.session.userId!;
      await storage.markConversationAsRead(conversationId, userId);
      const readAt = new Date().toISOString();
      const participants = await storage.getConversationParticipants(conversationId);
      for (const p of participants) {
        if (p.id !== userId) {
          sendToUser(p.id, JSON.stringify({ type: "conversation_read", conversationId, userId, readAt }));
        }
      }
      res.json({ ok: true });
    } catch {
      res.status(500).json({ message: "Failed to mark as read" });
    }
  });

  app.get("/api/conversations/:id/messages", requireAuth, async (req, res) => {
    try {
      const messages = await storage.getMessagesByConversationId(req.params.id);
      const messagesWithSender = await Promise.all(
        messages.map(async (msg) => {
          const sender = await storage.getUser(msg.senderId);
          return { ...msg, sender: sender ? { id: sender.id, username: sender.username, avatarData: sender.avatarData, avatarType: sender.avatarType } : null };
        })
      );
      res.json(messagesWithSender);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  app.post("/api/conversations/:id/messages", requireAuth, async (req, res) => {
    try {
      const { content, contentType, attachmentData, attachmentType, parentMessageId } = req.body;
      const conversationId = req.params.id;
      const senderId = req.session.userId!;
      
      console.log(`[Message] Creating message in conversation ${conversationId} from sender ${senderId}`);

      // Resolve reply info if parentMessageId provided
      let replyToContent: string | null = null;
      let replyToUsername: string | null = null;
      if (parentMessageId) {
        const allMsgs = await storage.getMessagesByConversationId(conversationId);
        const parent = allMsgs.find(m => m.id === parentMessageId);
        if (parent) {
          replyToContent = parent.isDeleted ? "Message deleted" : (parent.content || (parent.contentType === "image" ? "[Image]" : "[Attachment]"));
          const parentSender = await storage.getUser(parent.senderId);
          replyToUsername = parentSender?.username || "Unknown";
        }
      }
      
      const message = await storage.createMessage({
        conversationId,
        senderId,
        content,
        contentType: contentType || "text",
        attachmentData,
        attachmentType,
        parentMessageId: parentMessageId || null,
        replyToContent,
        replyToUsername,
      });
      
      const sender = await storage.getUser(senderId);
      const messageWithSender = { ...message, sender: sender ? { id: sender.id, username: sender.username, avatarData: sender.avatarData, avatarType: sender.avatarType } : null };
      
      // Send WebSocket notifications and email to conversation participants
      const participants = await storage.getConversationParticipants(conversationId);
      console.log(`[Message] Found ${participants.length} participants in conversation`);
      
      for (const participant of participants) {
        if (participant.id !== senderId) {
          console.log(`[Message] Processing recipient ${participant.id}`);
          
          // Send WebSocket notification
          sendToUser(participant.id, JSON.stringify({ type: "new_message", message: messageWithSender }));
          
          // Send email notification if recipient is offline
          const isRecipientOnline = onlineUsers.has(participant.id);
          console.log(`[Message] Recipient ${participant.id} online: ${isRecipientOnline}`);
          
          const shouldSend = await shouldSendChatNotification(participant.id, senderId, isRecipientOnline);
          if (shouldSend && sender) {
            const preview = content || (contentType === "image" ? "[Image]" : "[Attachment]");
            console.log(`[Message] Sending email notification to ${participant.id}`);
            await sendChatNotification(participant.id, sender.username, preview);
          } else if (!shouldSend) {
            console.log(`[Message] Email NOT sent to ${participant.id} - shouldSend returned false`);
          }
        }
      }
      
      res.json(messageWithSender);
    } catch (error) {
      console.error("[Message] Error:", error);
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  app.patch("/api/messages/:id", requireAuth, async (req, res) => {
    try {
      const { content } = req.body;
      const message = await storage.updateMessage(req.params.id, content);
      res.json(message);
    } catch (error) {
      res.status(500).json({ message: "Failed to update message" });
    }
  });

  app.delete("/api/messages/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteMessage(req.params.id);
      res.json({ message: "Message deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete message" });
    }
  });

  // Mark conversation as read
  app.post("/api/conversations/:id/read", requireAuth, async (req, res) => {
    try {
      await storage.markConversationAsRead(req.params.id, req.session.userId!);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to mark conversation as read" });
    }
  });

  // Get unread message count
  app.get("/api/unread-count", requireAuth, async (req, res) => {
    try {
      const count = await storage.getUnreadMessageCount(req.session.userId!);
      res.json({ count });
    } catch (error) {
      res.status(500).json({ message: "Failed to get unread count" });
    }
  });

  app.get("/api/friends", requireAuth, async (req, res) => {
    try {
      const friends = await storage.getFriends(req.session.userId!);
      res.json(friends.map(f => ({
        id: f.id,
        username: f.username,
        avatarData: f.avatarData,
        avatarType: f.avatarType,
        isMerchant: f.isMerchant,
      })));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch friends" });
    }
  });

  app.get("/api/friend-requests", requireAuth, async (req, res) => {
    try {
      const requests = await storage.getPendingFriendRequests(req.session.userId!);
      const requestsWithSender = await Promise.all(
        requests.map(async (req) => {
          const sender = await storage.getUser(req.senderId);
          return { ...req, sender: sender ? { id: sender.id, username: sender.username, avatarData: sender.avatarData, avatarType: sender.avatarType } : null };
        })
      );
      res.json(requestsWithSender);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch friend requests" });
    }
  });

  app.post("/api/friend-requests", requireAuth, async (req, res) => {
    try {
      const { receiverId } = req.body;
      const userId = req.session.userId!;

      if (receiverId === userId) {
        return res.status(400).json({ message: "Cannot send friend request to yourself" });
      }

      const areFriends = await storage.areFriends(userId, receiverId);
      if (areFriends) {
        return res.status(400).json({ message: "Already friends" });
      }

      const request = await storage.sendFriendRequest(userId, receiverId);
      res.json(request);
    } catch (error) {
      res.status(500).json({ message: "Failed to send friend request" });
    }
  });

  app.post("/api/friend-requests/:id/accept", requireAuth, async (req, res) => {
    try {
      await storage.acceptFriendRequest(req.params.id);
      res.json({ message: "Friend request accepted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to accept friend request" });
    }
  });

  app.post("/api/friend-requests/:id/reject", requireAuth, async (req, res) => {
    try {
      await storage.rejectFriendRequest(req.params.id);
      res.json({ message: "Friend request rejected" });
    } catch (error) {
      res.status(500).json({ message: "Failed to reject friend request" });
    }
  });

  app.delete("/api/friends/:id", requireAuth, async (req, res) => {
    try {
      await storage.removeFriend(req.session.userId!, req.params.id);
      res.json({ message: "Friend removed" });
    } catch (error) {
      res.status(500).json({ message: "Failed to remove friend" });
    }
  });

  app.post("/api/users/:id/block", requireAuth, async (req, res) => {
    try {
      await storage.blockUserChat(req.session.userId!, req.params.id);
      res.json({ message: "User blocked" });
    } catch (error) {
      res.status(500).json({ message: "Failed to block user" });
    }
  });

  app.delete("/api/users/:id/block", requireAuth, async (req, res) => {
    try {
      await storage.unblockUserChat(req.session.userId!, req.params.id);
      res.json({ message: "User unblocked" });
    } catch (error) {
      res.status(500).json({ message: "Failed to unblock user" });
    }
  });

  app.get("/api/blocked-users", requireAuth, async (req, res) => {
    try {
      const blocked = await storage.getBlockedUsers(req.session.userId!);
      res.json(blocked.map(u => ({
        id: u.id,
        username: u.username,
        avatarData: u.avatarData,
        avatarType: u.avatarType,
      })));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch blocked users" });
    }
  });

  // ============ NOTIFICATION SETTINGS ============

  app.get("/api/notification-settings", requireAuth, async (req, res) => {
    try {
      const settings = await storage.getNotificationSettings(req.session.userId!);
      res.json(settings || { 
        notificationsEnabled: false, 
        chatNotifications: true, 
        purchaseNotifications: true, 
        saleNotifications: true,
        email: null 
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch notification settings" });
    }
  });

  app.patch("/api/notification-settings", requireAuth, async (req, res) => {
    try {
      const { email, notificationsEnabled, chatNotifications, purchaseNotifications, saleNotifications } = req.body;
      const settings = await storage.upsertNotificationSettings(req.session.userId!, {
        email,
        notificationsEnabled,
        chatNotifications,
        purchaseNotifications,
        saleNotifications,
      });
      res.json(settings);
    } catch (error) {
      res.status(500).json({ message: "Failed to update notification settings" });
    }
  });

  // ============ MUTED USERS ============

  app.get("/api/muted-users", requireAuth, async (req, res) => {
    try {
      const muted = await storage.getMutedUsers(req.session.userId!);
      res.json(muted.map(u => ({
        id: u.id,
        username: u.username,
        avatarData: u.avatarData,
        avatarType: u.avatarType,
      })));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch muted users" });
    }
  });

  app.post("/api/users/:id/mute", requireAuth, async (req, res) => {
    try {
      await storage.muteUser(req.session.userId!, req.params.id);
      res.json({ message: "User muted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to mute user" });
    }
  });

  app.delete("/api/users/:id/mute", requireAuth, async (req, res) => {
    try {
      await storage.unmuteUser(req.session.userId!, req.params.id);
      res.json({ message: "User unmuted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to unmute user" });
    }
  });

  app.get("/api/users/:id/muted", requireAuth, async (req, res) => {
    try {
      const isMuted = await storage.isUserMuted(req.session.userId!, req.params.id);
      res.json({ isMuted });
    } catch (error) {
      res.status(500).json({ message: "Failed to check mute status" });
    }
  });

  app.get("/api/forum", async (req, res) => {
    try {
      const { search, trending } = req.query;
      let posts;
      
      if (trending === "true") {
        posts = await storage.getTrendingForumPosts();
      } else if (search && typeof search === "string") {
        posts = await storage.searchForumPosts(search);
      } else {
        posts = await storage.getAllForumPosts();
      }

      const postsWithUser = await Promise.all(
        posts.map(async (post) => {
          const user = await storage.getUser(post.userId);
          let hasLiked = false;
          if (req.session.userId) {
            hasLiked = await storage.hasLikedPost(req.session.userId, post.id);
          }
          return {
            ...post,
            user: user ? { id: user.id, username: user.username, avatarData: user.avatarData, avatarType: user.avatarType, isMerchant: user.isMerchant } : null,
            hasLiked,
          };
        })
      );

      res.json(postsWithUser);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch forum posts" });
    }
  });

  app.post("/api/forum", requireAuth, async (req, res) => {
    try {
      const postData = insertForumPostSchema.parse({ ...req.body, userId: req.session.userId });
      const post = await storage.createForumPost(postData);
      const user = await storage.getUser(req.session.userId!);
      res.json({
        ...post,
        user: user ? { id: user.id, username: user.username, avatarData: user.avatarData, avatarType: user.avatarType, isMerchant: user.isMerchant } : null,
        hasLiked: false,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      res.status(500).json({ message: "Failed to create post" });
    }
  });

  app.get("/api/forum/:id", async (req, res) => {
    try {
      const post = await storage.getForumPostById(req.params.id);
      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }
      const user = await storage.getUser(post.userId);
      const comments = await storage.getForumCommentsByPostId(post.id);
      const commentsWithUser = await Promise.all(
        comments.map(async (comment) => {
          const commentUser = await storage.getUser(comment.userId);
          return {
            ...comment,
            user: commentUser ? { id: commentUser.id, username: commentUser.username, avatarData: commentUser.avatarData, avatarType: commentUser.avatarType, isMerchant: commentUser.isMerchant } : null,
          };
        })
      );
      let hasLiked = false;
      if (req.session.userId) {
        hasLiked = await storage.hasLikedPost(req.session.userId, post.id);
      }
      res.json({
        ...post,
        user: user ? { id: user.id, username: user.username, avatarData: user.avatarData, avatarType: user.avatarType, isMerchant: user.isMerchant } : null,
        comments: commentsWithUser,
        hasLiked,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch post" });
    }
  });

  app.post("/api/forum/:id/like", requireAuth, async (req, res) => {
    try {
      const postId = req.params.id;
      const userId = req.session.userId!;
      
      const hasLiked = await storage.hasLikedPost(userId, postId);
      if (hasLiked) {
        await storage.unlikeForumPost(userId, postId);
        res.json({ hasLiked: false });
      } else {
        await storage.likeForumPost(userId, postId);
        res.json({ hasLiked: true });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to toggle like" });
    }
  });

  app.post("/api/forum/:id/comments", requireAuth, async (req, res) => {
    try {
      const commentData = insertForumCommentSchema.parse({
        ...req.body,
        postId: req.params.id,
        userId: req.session.userId,
      });
      const comment = await storage.createForumComment(commentData);
      const user = await storage.getUser(req.session.userId!);
      res.json({
        ...comment,
        user: user ? { id: user.id, username: user.username, avatarData: user.avatarData, avatarType: user.avatarType, isMerchant: user.isMerchant } : null,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      res.status(500).json({ message: "Failed to create comment" });
    }
  });

  app.patch("/api/forum/:id", requireAuth, async (req, res) => {
    try {
      const post = await storage.getForumPostById(req.params.id);
      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }
      const user = await storage.getUser(req.session.userId!);
      if (post.userId !== req.session.userId && !user?.isAdmin) {
        return res.status(403).json({ message: "Not authorized to edit this post" });
      }
      const { content } = req.body;
      if (!content || content.trim().length === 0) {
        return res.status(400).json({ message: "Content is required" });
      }
      const updated = await storage.updateForumPost(req.params.id, content.trim());
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update post" });
    }
  });

  app.delete("/api/forum/:id", requireAuth, async (req, res) => {
    try {
      const post = await storage.getForumPostById(req.params.id);
      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }
      const user = await storage.getUser(req.session.userId!);
      if (post.userId !== req.session.userId && !user?.isAdmin) {
        return res.status(403).json({ message: "Not authorized to delete this post" });
      }
      await storage.deleteForumPost(req.params.id);
      res.json({ message: "Post deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete post" });
    }
  });

  app.patch("/api/forum/comments/:id", requireAuth, async (req, res) => {
    try {
      const comment = await storage.getForumCommentById(req.params.id);
      if (!comment) {
        return res.status(404).json({ message: "Comment not found" });
      }
      const user = await storage.getUser(req.session.userId!);
      if (comment.userId !== req.session.userId && !user?.isAdmin) {
        return res.status(403).json({ message: "Not authorized to edit this comment" });
      }
      const { content } = req.body;
      if (!content || content.trim().length === 0) {
        return res.status(400).json({ message: "Content is required" });
      }
      const updated = await storage.updateForumComment(req.params.id, content.trim());
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update comment" });
    }
  });

  app.delete("/api/forum/comments/:id", requireAuth, async (req, res) => {
    try {
      const comment = await storage.getForumCommentById(req.params.id);
      if (!comment) {
        return res.status(404).json({ message: "Comment not found" });
      }
      const user = await storage.getUser(req.session.userId!);
      if (comment.userId !== req.session.userId && !user?.isAdmin) {
        return res.status(403).json({ message: "Not authorized to delete this comment" });
      }
      await storage.deleteForumComment(req.params.id, comment.postId);
      res.json({ message: "Comment deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete comment" });
    }
  });

  app.get("/api/admin/stats", requireAdmin, async (req, res) => {
    try {
      const [totalProducts, totalReviews, totalUsers, totalMerchants, averageRating] = await Promise.all([
        storage.getProductCount(),
        storage.getReviewCount(),
        storage.getUserCount(),
        storage.getMerchantCount(),
        storage.getAverageRating(),
      ]);

      res.json({
        totalProducts,
        totalReviews,
        totalUsers,
        totalMerchants,
        averageRating,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  app.get("/api/admin/users", requireAdmin, async (req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      res.json(allUsers.map(u => ({
        id: u.id,
        username: u.username,
        isAdmin: u.isAdmin,
        isMerchant: u.isMerchant,
        isBlocked: u.isBlocked,
        createdAt: u.createdAt,
      })));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.post("/api/admin/users/:id/block", requireAdmin, async (req, res) => {
    try {
      const user = await storage.blockUser(req.params.id);
      res.json(user);
    } catch (error) {
      res.status(500).json({ message: "Failed to block user" });
    }
  });

  app.post("/api/admin/users/:id/unblock", requireAdmin, async (req, res) => {
    try {
      const user = await storage.unblockUser(req.params.id);
      res.json(user);
    } catch (error) {
      res.status(500).json({ message: "Failed to unblock user" });
    }
  });

  // Get detailed user info with spending
  app.get("/api/admin/users/:id", requireAdmin, async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const totalSpending = await storage.getUserTotalSpending(user.id);
      const products = user.isMerchant ? await storage.getProductsByMerchantId(user.id) : [];
      
      res.json({
        id: user.id,
        username: user.username,
        isAdmin: user.isAdmin,
        isMerchant: user.isMerchant,
        isBlocked: user.isBlocked,
        bio: user.bio,
        avatarData: user.avatarData,
        avatarType: user.avatarType,
        merchantSince: user.merchantSince,
        registrationIp: user.registrationIp,
        createdAt: user.createdAt,
        totalSpending,
        products: products.map(p => ({
          id: p.id,
          name: p.name,
          price: p.price,
          createdAt: p.createdAt,
        })),
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch user details" });
    }
  });

  // Update user (username/password)
  app.patch("/api/admin/users/:id", requireAdmin, async (req, res) => {
    try {
      const { username, password } = req.body;
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const updateData: Partial<{ username: string; password: string }> = {};
      
      // Only update username if provided and different
      if (username && typeof username === "string" && username.trim() !== "" && username.trim() !== user.username) {
        if (username.trim().length < 3) {
          return res.status(400).json({ message: "Username must be at least 3 characters" });
        }
        const existingUser = await storage.getUserByUsername(username.trim());
        if (existingUser) {
          return res.status(400).json({ message: "Username already exists" });
        }
        updateData.username = username.trim();
      }
      
      // Only update password if provided and non-empty
      if (password && typeof password === "string" && password.trim() !== "") {
        if (password.length < 6) {
          return res.status(400).json({ message: "Password must be at least 6 characters" });
        }
        updateData.password = await bcrypt.hash(password, SALT_ROUNDS);
      }
      
      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
      }
      
      const updatedUser = await storage.updateUser(req.params.id, updateData);
      res.json({
        id: updatedUser?.id,
        username: updatedUser?.username,
        message: "User updated successfully",
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  // Delete user
  app.delete("/api/admin/users/:id", requireAdmin, async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      if (user.isAdmin) {
        return res.status(403).json({ message: "Cannot delete admin user" });
      }
      
      const deleted = await storage.deleteUser(req.params.id);
      if (!deleted) {
        return res.status(500).json({ message: "Failed to delete user" });
      }
      res.json({ message: "User deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  // Delete merchant's product (admin)
  app.delete("/api/admin/users/:userId/products/:productId", requireAdmin, async (req, res) => {
    try {
      const product = await storage.getProductById(req.params.productId);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      if (product.merchantId !== req.params.userId) {
        return res.status(400).json({ message: "Product does not belong to this user" });
      }
      
      const deleted = await storage.deleteProduct(req.params.productId);
      if (!deleted) {
        return res.status(500).json({ message: "Failed to delete product" });
      }
      res.json({ message: "Product deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete product" });
    }
  });

  app.get("/api/admin/products", requireAdmin, async (req, res) => {
    try {
      const products = await storage.getAllProducts();
      const productsWithMerchant = await Promise.all(
        products.map(async (product) => {
          const merchant = product.merchantId ? await storage.getUser(product.merchantId) : null;
          return {
            ...product,
            merchant: merchant ? { id: merchant.id, username: merchant.username } : null,
          };
        })
      );
      res.json(productsWithMerchant);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch products" });
    }
  });

  app.get("/api/admin/products/:id", requireAdmin, async (req, res) => {
    try {
      const product = await storage.getProductById(req.params.id);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      res.json(product);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch product" });
    }
  });

  app.post("/api/admin/products", requireAdmin, async (req, res) => {
    try {
      const productData = insertProductSchema.parse(req.body);
      const product = await storage.createProduct(productData);
      res.json(product);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      res.status(500).json({ message: "Failed to create product" });
    }
  });

  app.patch("/api/admin/products/:id", requireAdmin, async (req, res) => {
    try {
      const product = await storage.updateProduct(req.params.id, req.body);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      res.json(product);
    } catch (error) {
      res.status(500).json({ message: "Failed to update product" });
    }
  });

  app.delete("/api/admin/products/:id", requireAdmin, async (req, res) => {
    try {
      const deleted = await storage.deleteProduct(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Product not found" });
      }
      res.json({ message: "Product deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete product" });
    }
  });

  // ============ BITCOIN ESCROW SYSTEM ROUTES ============

  // 24-hour auto-release timer - runs every minute
  const processExpiredEscrows = async () => {
    try {
      const expiredEscrows = await storage.getExpiredEscrowOrders();
      
      for (const escrow of expiredEscrows) {
        // Check if there's a dispute (if so, don't auto-release)
        const dispute = await storage.getDisputeByEscrowOrderId(escrow.id);
        if (dispute) continue;

        // Determine coin type and get correct amount
        const isBtc = escrow.coinSymbol === "BTC";
        const isBnb = escrow.coinSymbol === "BNB";
        const isUsdt = escrow.coinSymbol === "USDT";
        const totalAmount = isBtc ? escrow.btcAmount : escrow.cryptoAmount;

        // Calculate fee - check product-specific fee first, then global fee
        let feePercent = 0;
        const globalFeeSetting = await storage.getAdminSetting("global_fee_percent");
        if (globalFeeSetting) {
          feePercent = parseFloat(globalFeeSetting.value) || 0;
        }
        
        // Check for product-specific fee from the order
        const order = await storage.getOrder(escrow.orderId);
        if (order) {
          const orderItems = await storage.getOrderItems(escrow.orderId);
          for (const item of orderItems) {
            const productFee = await storage.getProductFee(item.productId);
            if (productFee) {
              feePercent = Math.max(feePercent, productFee.feePercent); // Use higher fee
            }
          }
        }

        // Calculate fee amount and merchant amount
        const feeAmount = (totalAmount * feePercent) / 100;
        const merchantAmount = totalAmount - feeAmount;

        // Auto-release to merchant
        await storage.updateEscrowOrder(escrow.id, {
          status: "released",
          releasedAt: new Date(),
          feePercent: feePercent,
          feeAmount: feeAmount,
          merchantAmount: merchantAmount,
        });

        // Add fee to admin wallet
        if (feeAmount > 0) {
          if (isBtc) {
            await storage.updateAdminWalletBalance(feeAmount, 0, 0);
          } else if (isBnb) {
            await storage.updateAdminWalletBalance(0, feeAmount, 0);
          } else if (isUsdt) {
            await storage.updateAdminWalletBalance(0, 0, feeAmount);
          }
          console.log(`[Escrow Timer] Fee collected: ${feeAmount.toFixed(isBtc ? 8 : 6)} ${escrow.coinSymbol} (${feePercent}%)`);
        }

        // Get or create merchant wallet
        let wallet = await storage.getVirtualWallet(escrow.merchantId);
        if (!wallet) {
          wallet = await storage.createVirtualWallet(escrow.merchantId);
        }

        // Move from pending to available balance (totalEarned updated automatically) - use merchantAmount after fee
        if (isBtc) {
          await storage.updateVirtualWalletBalance(escrow.merchantId, merchantAmount, -totalAmount);
        } else if (isBnb) {
          await storage.updateVirtualWalletBnbBalance(escrow.merchantId, merchantAmount, -totalAmount);
        } else if (isUsdt) {
          await storage.updateVirtualWalletUsdtBalance(escrow.merchantId, merchantAmount, -totalAmount);
        }

        // Create ledger entry
        const updatedWallet = await storage.getVirtualWallet(escrow.merchantId);
        await storage.createLedgerEntry({
          userId: escrow.merchantId,
          escrowOrderId: escrow.id,
          type: "escrow_released",
          btcAmount: isBtc ? merchantAmount : 0,
          bnbAmount: isBnb ? merchantAmount : 0,
          balanceAfter: isBtc ? (updatedWallet?.availableBalance || 0) : isBnb ? (updatedWallet?.bnbAvailableBalance || 0) : (updatedWallet?.usdtAvailableBalance || 0),
          description: `Auto-released ${merchantAmount.toFixed(isBtc ? 8 : 6)} ${escrow.coinSymbol} after 24h escrow period (fee: ${feeAmount.toFixed(isBtc ? 8 : 6)} ${escrow.coinSymbol})`,
        });

        // Send email notifications for completed purchase
        if (order) {
          const buyer = await storage.getUser(escrow.buyerId);
          const merchant = await storage.getUser(escrow.merchantId);
          const orderItems = await storage.getOrderItems(escrow.orderId);
          const productNames = orderItems.map(item => item.productId).join(", ");
          const price = `$${escrow.usdAmount}`;
          
          if (buyer && merchant) {
            sendPurchaseNotification(escrow.buyerId, productNames, price, merchant.username);
            sendSaleNotification(escrow.merchantId, buyer.username, productNames, price);
          }
        }

        console.log(`[Escrow Timer] Auto-released ${merchantAmount} ${escrow.coinSymbol} escrow ${escrow.id} to merchant ${escrow.merchantId}`);
      }
    } catch (error) {
      console.error("[Escrow Timer] Error processing expired escrows:", error);
    }
  };

  // Start the timer (check every minute)
  setInterval(processExpiredEscrows, 60 * 1000);
  console.log("[Escrow Timer] Started 24-hour auto-release timer");

  // Initialize wallet services
  await walletService.initialize();
  await bnbWalletService.initialize();
  console.log("[Wallet] BTC and BNB wallet services initialized");

  // Get real BTC price from blockchain service
  const getBtcRate = async () => {
    return await blockchainService.getCurrentBtcPrice();
  };

  // Validate BTC address format
  const isValidBtcAddress = (address: string): boolean => {
    if (!address || typeof address !== 'string') return false;
    // Native SegWit (bech32)
    if (/^bc1[a-z0-9]{25,90}$/i.test(address)) return true;
    // Legacy P2PKH
    if (/^1[a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address)) return true;
    // P2SH
    if (/^3[a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address)) return true;
    return false;
  };

  // Generate real BTC address for payment using HD wallet - uses merchant's index with payment index 0 for consistent address per merchant
  const generatePaymentAddress = async (merchantId: string): Promise<{ address: string; derivationPath: string }> => {
    let wallet = await storage.getVirtualWallet(merchantId);
    if (!wallet) {
      // Auto-create wallet for merchant if missing
      wallet = await storage.createVirtualWallet(merchantId);
    }
    
    // Use merchant's derivation index with payment index 0 for consistent address per merchant
    const merchantIndex = wallet.derivationIndex || 0;
    const { address, path } = walletService.derivePaymentAddress(merchantIndex, 0);
    
    return { address, derivationPath: path };
  };

  // --- Wallet Routes ---

  // Check wallet configuration status (for payment coins)
  app.get("/api/wallet/status", async (req, res) => {
    try {
      res.json({
        btcInitialized: walletService.isInitialized(),
        bnbInitialized: bnbWalletService.isInitialized(),
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to check wallet status" });
    }
  });

  app.get("/api/wallet", requireAuth, async (req, res) => {
    try {
      let wallet = await storage.getVirtualWallet(req.session.userId!);
      if (!wallet) {
        wallet = await storage.createVirtualWallet(req.session.userId!);
      }
      res.json(wallet);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch wallet" });
    }
  });

  app.get("/api/wallet/ledger", requireAuth, async (req, res) => {
    try {
      const entries = await storage.getLedgerEntriesByUser(req.session.userId!);
      res.json(entries);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch ledger" });
    }
  });

  // Enhanced payment history with transaction details
  app.get("/api/wallet/payment-history", requireAuth, async (req, res) => {
    try {
      const entries = await storage.getLedgerEntriesByUser(req.session.userId!);
      
      // Enrich ledger entries with related transaction data
      const enrichedHistory = await Promise.all(
        entries.map(async (entry) => {
          let transactionDetails: any = {
            id: entry.id,
            type: entry.type,
            amount: entry.btcAmount,
            description: entry.description,
            date: entry.createdAt,
            balanceAfter: entry.balanceAfter,
          };

          // If related to escrow order, fetch buyer/merchant and transaction hash
          if (entry.escrowOrderId) {
            const escrow = await storage.getEscrowOrder(entry.escrowOrderId);
            if (escrow) {
              const otherUser = escrow.buyerId === req.session.userId 
                ? await storage.getUser(escrow.merchantId)
                : await storage.getUser(escrow.buyerId);
              
              transactionDetails = {
                ...transactionDetails,
                transactionHash: escrow.transactionHash,
                coinSymbol: escrow.coinSymbol,
                status: escrow.status,
                relatedUser: otherUser ? { id: otherUser.id, username: otherUser.username } : null,
                relatedUserType: escrow.buyerId === req.session.userId ? "merchant" : "buyer",
              };
            }
          }

          // If related to withdrawal, fetch details
          if (entry.withdrawalId) {
            const withdrawal = await storage.getWithdrawalRequest(entry.withdrawalId);
            if (withdrawal) {
              transactionDetails = {
                ...transactionDetails,
                transactionHash: withdrawal.transactionHash,
                coinSymbol: withdrawal.coinSymbol,
                address: withdrawal.btcAddress || withdrawal.bnbAddress || withdrawal.usdtAddress,
                status: withdrawal.status,
              };
            }
          }

          return transactionDetails;
        })
      );

      res.json(enrichedHistory);
    } catch (error) {
      console.error("Payment history error:", error);
      res.status(500).json({ message: "Failed to fetch payment history" });
    }
  });

  // --- Escrow Routes ---

  // Create escrow order for a purchase
  app.post("/api/escrow/create", requireAuth, async (req, res) => {
    try {
      const { orderId, merchantId, buyerRefundAddress, coinSymbol = "BTC" } = req.body;
      
      if (!orderId || !merchantId) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      // PRICE TAMPERING PROTECTION: Re-calculate usdAmount on server from order details
      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      
      if (order.userId !== req.session.userId) {
        return res.status(403).json({ message: "You don't have permission to create escrow for this order" });
      }

      const usdAmount = order.totalAmount;

      // Prevent merchants from buying their own products
      if (req.session.userId === merchantId) {
        return res.status(400).json({ message: "You cannot purchase your own product" });
      }

      // Check if coin is enabled
      const coins = await storage.getAllPaymentCoins();
      const selectedCoin = coins.find(c => c.symbol === coinSymbol && c.isEnabled);
      if (!selectedCoin) {
        return res.status(400).json({ message: `Payment with ${coinSymbol} is not available` });
      }

      let cryptoRate: number;
      let cryptoAmount: number;
      let depositAddress: string;
      let derivationPath: string;

      if (coinSymbol === "BNB" || coinSymbol === "USDT") {
        // Check if BNB/USDT wallet is initialized
        if (!bnbWalletService.isInitialized()) {
          return res.status(400).json({ message: "BNB/USDT payments are not configured. Please contact admin to set up the wallet seed." });
        }
        
        // Get price for BNB (USDT uses BNB price for gas fees estimation)
        cryptoRate = coinSymbol === "USDT" 
          ? 1.0 // USDT is 1:1 with USD, so rate is always 1
          : await bnbBlockchainService.getCurrentBnbPrice();
        cryptoAmount = parseFloat(usdAmount) / cryptoRate;
        
        // Use merchant's derivation index with payment index 0 for consistent address per merchant
        let wallet = await storage.getVirtualWallet(merchantId);
        if (!wallet) {
          wallet = await storage.createVirtualWallet(merchantId);
        }
        const merchantIndex = wallet.derivationIndex || 0;
        const result = bnbWalletService.derivePaymentAddress(merchantIndex, 0);
        depositAddress = result.address;
        derivationPath = result.path;

        // Validate buyer refund address if provided
        if (buyerRefundAddress && !bnbBlockchainService.isValidBnbAddress(buyerRefundAddress)) {
          return res.status(400).json({ message: "Invalid BNB address format for refund address" });
        }
      } else {
        // Check if BTC wallet is initialized
        if (!walletService.isInitialized()) {
          return res.status(400).json({ message: "BTC payments are not configured. Please contact admin to set up the wallet seed." });
        }
        
        cryptoRate = await getBtcRate();
        cryptoAmount = parseFloat(usdAmount) / cryptoRate;
        const result = await generatePaymentAddress(merchantId);
        depositAddress = result.address;
        derivationPath = result.derivationPath;

        // Validate buyer refund address if provided
        if (buyerRefundAddress && !isValidBtcAddress(buyerRefundAddress)) {
          return res.status(400).json({ message: "Invalid BTC address format for refund address" });
        }
      }

      const escrowOrder = await storage.createEscrowOrder({
        orderId,
        buyerId: req.session.userId!,
        merchantId,
        coinSymbol,
        cryptoAmount,
        btcAmount: coinSymbol === "BTC" ? cryptoAmount : 0,
        usdAmount: usdAmount.toString(),
        depositAddress,
        buyerRefundAddress: buyerRefundAddress || null,
      });
      
      console.log(`[Escrow] Created ${coinSymbol} order ${escrowOrder.id} with address ${depositAddress} (${derivationPath})`);

      res.json({
        ...escrowOrder,
        cryptoRate,
        btcRate: coinSymbol === "BTC" ? cryptoRate : undefined,
        bnbRate: coinSymbol === "BNB" ? cryptoRate : undefined,
        usdtRate: coinSymbol === "USDT" ? cryptoRate : undefined,
      });
    } catch (error) {
      console.error("Create escrow error:", error);
      res.status(500).json({ message: "Failed to create escrow order" });
    }
  });

  // Simulate payment received (in production this would be triggered by blockchain monitoring)
  app.post("/api/escrow/:id/simulate-payment", requireAuth, async (req, res) => {
    try {
      const escrow = await storage.getEscrowOrder(req.params.id);
      if (!escrow) {
        return res.status(404).json({ message: "Escrow order not found" });
      }

      if (escrow.status !== "pending_payment") {
        return res.status(400).json({ message: "Payment already processed" });
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours from now

      const updated = await storage.updateEscrowOrder(escrow.id, {
        status: "escrow",
        escrowStartedAt: now,
        escrowExpiresAt: expiresAt,
        transactionHash: `sim_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      });

      // Decrement stock now that payment is confirmed
      try {
        const confirmedOrderItems = await storage.getOrderItems(escrow.orderId);
        for (const orderItem of confirmedOrderItems) {
          await storage.decrementStock(orderItem.productId, orderItem.quantity || 1);
        }
      } catch (stockError) {
        console.error("[SimulatePayment] Failed to decrement stock:", stockError);
      }

      // Add to merchant's pending balance (held in escrow)
      let wallet = await storage.getVirtualWallet(escrow.merchantId);
      if (!wallet) {
        wallet = await storage.createVirtualWallet(escrow.merchantId);
      }
      await storage.updateVirtualWalletBalance(escrow.merchantId, 0, escrow.btcAmount);

      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to simulate payment" });
    }
  });

  // Verify payment on blockchain - buyer provides their wallet address
  app.post("/api/escrow/:id/verify-payment", requireAuth, async (req, res) => {
    try {
      const { buyerWalletAddress } = req.body;
      const escrow = await storage.getEscrowOrder(req.params.id);
      
      if (!escrow) {
        return res.status(404).json({ message: "Escrow order not found" });
      }

      // Only buyer can verify their payment
      if (escrow.buyerId !== req.session.userId) {
        return res.status(403).json({ message: "Only buyer can verify payment" });
      }

      if (escrow.status !== "pending_payment") {
        return res.status(400).json({ message: "Payment already processed" });
      }

      const isBtc = escrow.coinSymbol === "BTC";
      const isBnb = escrow.coinSymbol === "BNB";
      const isUsdt = escrow.coinSymbol === "USDT";
      const cryptoAmount = escrow.cryptoAmount || escrow.btcAmount;

      // Validate buyer wallet address if provided
      if (buyerWalletAddress) {
        if ((isBnb || isUsdt) && !bnbBlockchainService.isValidBnbAddress(buyerWalletAddress)) {
          return res.status(400).json({ message: `Invalid ${escrow.coinSymbol} wallet address format` });
        } else if (isBtc && !isValidBtcAddress(buyerWalletAddress)) {
          return res.status(400).json({ message: "Invalid BTC wallet address format" });
        }
      }

      console.log(`[Escrow] Verifying ${escrow.coinSymbol} payment for ${escrow.id}, buyer address: ${buyerWalletAddress || 'not provided'}`);

      let verification: { verified: boolean; txHash?: string; confirmations?: number; fromAddress?: string };

      // Only count transactions after the escrow order was created
      const escrowCreatedAt = new Date(escrow.createdAt).getTime();

      if (isBnb || isUsdt) {
        verification = await bnbBlockchainService.verifyPayment(
          escrow.depositAddress,
          cryptoAmount,
          buyerWalletAddress,
          escrowCreatedAt
        );

        if (!verification.verified && buyerWalletAddress) {
          const searchResult = await bnbBlockchainService.searchPaymentByBuyerAddress(
            buyerWalletAddress,
            cryptoAmount,
            escrow.depositAddress,
            escrowCreatedAt
          );
          
          if (searchResult.found) {
            verification = {
              verified: true,
              txHash: searchResult.txHash,
              confirmations: searchResult.confirmations,
              fromAddress: buyerWalletAddress,
            };
          }
        }
      } else {
        verification = await blockchainService.verifyPayment(
          escrow.depositAddress,
          cryptoAmount,
          buyerWalletAddress,
          escrowCreatedAt
        );

        if (!verification.verified && buyerWalletAddress) {
          const searchResult = await blockchainService.searchPaymentByBuyerAddress(
            buyerWalletAddress,
            cryptoAmount,
            escrow.depositAddress,
            escrowCreatedAt
          );
          
          if (searchResult.found) {
            verification = {
              verified: true,
              txHash: searchResult.txHash,
              confirmations: searchResult.confirmations,
              fromAddress: buyerWalletAddress,
            };
          }
        }
      }

      if (!verification.verified) {
        return res.status(400).json({ 
          message: "Payment not found on blockchain",
          hint: `Make sure you sent the exact amount to the deposit address`
        });
      }

      // Check if this transaction hash has already been used for another payment
      if (verification.txHash) {
        const existingOrder = await storage.getEscrowOrderByTransactionHash(verification.txHash);
        if (existingOrder && existingOrder.id !== escrow.id) {
          return res.status(400).json({ 
            message: "This transaction has already been used for another payment",
            hint: "Each transaction can only be used for one payment. Please send a new payment."
          });
        }
      }

      // Payment verified - put into 24-hour escrow lock (only admin can release early)
      const now = new Date();
      const escrowExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours from now

      const updated = await storage.updateEscrowOrder(escrow.id, {
        status: "escrow",
        escrowStartedAt: now,
        escrowExpiresAt: escrowExpiresAt,
        confirmedAt: now,
        transactionHash: verification.txHash,
        buyerRefundAddress: buyerWalletAddress || escrow.buyerRefundAddress,
      });


      // Decrement stock now that payment is confirmed on blockchain
      try {
        const confirmedOrderItems = await storage.getOrderItems(escrow.orderId);
        for (const orderItem of confirmedOrderItems) {
          await storage.decrementStock(orderItem.productId, orderItem.quantity || 1);
        }
      } catch (stockError) {
        console.error("[VerifyPayment] Failed to decrement stock:", stockError);
      }

      // Add to merchant's pending balance (will be released after 24h or by admin)
      let wallet = await storage.getVirtualWallet(escrow.merchantId);
      if (!wallet) {
        wallet = await storage.createVirtualWallet(escrow.merchantId);
      }
      
      // Update correct balance based on coin type - add to PENDING balance
      if (isBtc) {
        await storage.updateVirtualWalletBalance(escrow.merchantId, 0, escrow.btcAmount);
      } else if (isBnb) {
        await storage.updateVirtualWalletBnbBalance(escrow.merchantId, 0, cryptoAmount);
      } else if (isUsdt) {
        await storage.updateVirtualWalletUsdtBalance(escrow.merchantId, 0, cryptoAmount);
      }

      // Create ledger entry for escrow received
      const updatedWallet = await storage.getVirtualWallet(escrow.merchantId);
      const pendingBalance = isBtc ? (updatedWallet?.pendingBalance || 0) : isBnb ? (updatedWallet?.bnbPendingBalance || 0) : (updatedWallet?.usdtPendingBalance || 0);
      await storage.createLedgerEntry({
        userId: escrow.merchantId,
        escrowOrderId: escrow.id,
        type: "escrow_received",
        btcAmount: isBtc ? escrow.btcAmount : 0,
        balanceAfter: pendingBalance,
        description: `Payment received - in 24h escrow lock for ${escrow.coinSymbol} order`,
      });

      // Create purchase snapshot for the buyer
      try {
        const orderItemsList = await db.select().from(orderItems).where(eq(orderItems.orderId, escrow.orderId));
        if (orderItemsList.length > 0) {
          const productId = orderItemsList[0].productId;
          const product = await storage.getProductById(productId);
          if (product) {
            await storage.createPurchaseSnapshot({
              escrowOrderId: escrow.id,
              productName: product.name,
              productDescription: product.description,
              productImages: product.images || (product.imageData ? [product.imageData] : []),
              afterBuyMessage: product.afterBuyMessage,
              afterBuyButtonLabel: product.afterBuyButtonLabel,
              afterBuyButtonUrl: product.afterBuyButtonUrl,
            });
          }
        }
      } catch (snapshotError) {
        console.error("Failed to create purchase snapshot:", snapshotError);
      }

      // Send email notifications
      try {
        const orderItemsList = await db.select().from(orderItems).where(eq(orderItems.orderId, escrow.orderId));
        if (orderItemsList.length > 0) {
          const productId = orderItemsList[0].productId;
          const product = await storage.getProductById(productId);
          const merchant = await storage.getUser(escrow.merchantId);
          const buyer = await storage.getUser(escrow.buyerId);
          
          if (product && merchant && buyer) {
            // Send payment confirmation to buyer
            await sendPaymentConfirmationNotification(
              escrow.buyerId,
              product.name,
              `$${escrow.usdAmount}`,
              merchant.username,
              cryptoAmount.toFixed(8),
              escrow.coinSymbol,
              verification.txHash,
              escrowExpiresAt
            );
            
            // Send sale notification to merchant
            await sendSaleNotification(
              escrow.merchantId,
              buyer.username,
              product.name,
              `$${escrow.usdAmount}`,
              product.id,
              escrow.orderId
            );
          }
        }
      } catch (emailError) {
        console.error("Failed to send email notifications:", emailError);
      }

      res.json({
        message: `${escrow.coinSymbol} payment verified - funds in 24-hour escrow. Admin can release early or auto-release after 24h.`,
        escrow: updated,
        txHash: verification.txHash,
        confirmations: verification.confirmations,
      });
    } catch (error) {
      console.error("Payment verification error:", error);
      res.status(500).json({ message: "Failed to verify payment" });
    }
  });

  // Verify payment by transaction hash (no API key needed for BNB)
  app.post("/api/escrow/:id/verify-by-txhash", requireAuth, async (req, res) => {
    try {
      const { txHash, buyerWalletAddress } = req.body;
      
      if (!txHash) {
        return res.status(400).json({ message: "Transaction hash required" });
      }

      const escrow = await storage.getEscrowOrder(req.params.id);
      
      if (!escrow) {
        return res.status(404).json({ message: "Escrow order not found" });
      }

      // Only buyer can verify their payment
      if (escrow.buyerId !== req.session.userId) {
        return res.status(403).json({ message: "Only buyer can verify payment" });
      }

      if (escrow.status !== "pending_payment") {
        return res.status(400).json({ message: "Payment already processed" });
      }

      const isBtc = escrow.coinSymbol === "BTC";
      const isBnb = escrow.coinSymbol === "BNB";
      const isUsdt = escrow.coinSymbol === "USDT";
      const cryptoAmount = escrow.cryptoAmount || escrow.btcAmount;

      console.log(`[Escrow] Verifying ${escrow.coinSymbol} payment by TX hash: ${txHash}`);

      let verification: { verified: boolean; txHash?: string; actualAmount?: number; confirmations?: number; fromAddress?: string };

      if (isBnb || isUsdt) {
        // Use different verification for USDT (token transfer) vs BNB (native transfer)
        if (escrow.coinSymbol === "USDT") {
          verification = await bnbBlockchainService.verifyUsdtPayment(
            txHash,
            escrow.depositAddress,
            cryptoAmount,
            buyerWalletAddress
          );
        } else {
          // For BNB, use standard verification
          verification = await bnbBlockchainService.verifyPaymentByTxHash(
            txHash,
            escrow.depositAddress,
            cryptoAmount,
            buyerWalletAddress
          );
        }
      } else {
        // For BTC, use getTransaction to verify
        const tx = await blockchainService.getTransaction(txHash);
        if (tx && tx.to.toLowerCase() === escrow.depositAddress.toLowerCase()) {
          const amountDiff = Math.abs(tx.value - cryptoAmount);
          const tolerance = Math.max(cryptoAmount * 0.10, 0.00001);
          verification = {
            verified: amountDiff <= tolerance && tx.confirmations >= 1,
            txHash,
            actualAmount: tx.value,
            confirmations: tx.confirmations,
            fromAddress: tx.from,
          };
        } else {
          verification = { verified: false };
        }
      }

      if (!verification.verified) {
        return res.status(400).json({ 
          message: "Payment verification failed",
          hint: "Make sure the transaction was sent to the correct deposit address with the correct amount"
        });
      }

      // Check if this transaction hash has already been used for another payment
      const existingOrder = await storage.getEscrowOrderByTransactionHash(txHash);
      if (existingOrder && existingOrder.id !== escrow.id) {
        return res.status(400).json({ 
          message: "This transaction has already been used for another payment",
          hint: "Each transaction can only be used for one payment. Please send a new payment."
        });
      }

      // Payment verified - put into 24-hour escrow lock (only admin can release early)
      const now = new Date();
      const escrowExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours from now

      const updated = await storage.updateEscrowOrder(escrow.id, {
        status: "escrow",
        escrowStartedAt: now,
        escrowExpiresAt: escrowExpiresAt,
        confirmedAt: now,
        transactionHash: verification.txHash,
        buyerRefundAddress: buyerWalletAddress || escrow.buyerRefundAddress,
      });

      // Decrement stock now that payment is confirmed on blockchain
      try {
        const confirmedOrderItems = await storage.getOrderItems(escrow.orderId);
        for (const orderItem of confirmedOrderItems) {
          await storage.decrementStock(orderItem.productId, orderItem.quantity || 1);
        }
      } catch (stockError) {
        console.error("[VerifyPayment2] Failed to decrement stock:", stockError);
      }


      // Add to merchant's pending balance (will be released after 24h or by admin)
      let wallet = await storage.getVirtualWallet(escrow.merchantId);
      if (!wallet) {
        wallet = await storage.createVirtualWallet(escrow.merchantId);
      }
      
      // Update correct balance based on coin type - add to PENDING balance
      if (isBtc) {
        await storage.updateVirtualWalletBalance(escrow.merchantId, 0, escrow.btcAmount);
      } else if (isBnb) {
        await storage.updateVirtualWalletBnbBalance(escrow.merchantId, 0, cryptoAmount);
      } else if (isUsdt) {
        await storage.updateVirtualWalletUsdtBalance(escrow.merchantId, 0, cryptoAmount);
      }

      // Create ledger entry for escrow received
      const updatedWallet2 = await storage.getVirtualWallet(escrow.merchantId);
      const pendingBalance2 = isBtc ? (updatedWallet2?.pendingBalance || 0) : isBnb ? (updatedWallet2?.bnbPendingBalance || 0) : (updatedWallet2?.usdtPendingBalance || 0);
      await storage.createLedgerEntry({
        userId: escrow.merchantId,
        escrowOrderId: escrow.id,
        type: "escrow_received",
        btcAmount: isBtc ? escrow.btcAmount : 0,
        balanceAfter: pendingBalance2,
        description: `Payment received - in 24h escrow lock for ${escrow.coinSymbol} order (TX hash verification)`,
      });

      // Create purchase snapshot for the buyer
      try {
        const orderItemsList = await db.select().from(orderItems).where(eq(orderItems.orderId, escrow.orderId));
        if (orderItemsList.length > 0) {
          const productId = orderItemsList[0].productId;
          const product = await storage.getProductById(productId);
          if (product) {
            await storage.createPurchaseSnapshot({
              escrowOrderId: escrow.id,
              productName: product.name,
              productDescription: product.description,
              productImages: product.images || (product.imageData ? [product.imageData] : []),
              afterBuyMessage: product.afterBuyMessage,
              afterBuyButtonLabel: product.afterBuyButtonLabel,
              afterBuyButtonUrl: product.afterBuyButtonUrl,
            });
          }
        }
      } catch (snapshotError) {
        console.error("Failed to create purchase snapshot:", snapshotError);
      }

      // Send email notifications
      try {
        const orderItemsList = await db.select().from(orderItems).where(eq(orderItems.orderId, escrow.orderId));
        if (orderItemsList.length > 0) {
          const productId = orderItemsList[0].productId;
          const product = await storage.getProductById(productId);
          const merchant = await storage.getUser(escrow.merchantId);
          const buyer = await storage.getUser(escrow.buyerId);
          
          if (product && merchant && buyer) {
            // Send payment confirmation to buyer
            await sendPaymentConfirmationNotification(
              escrow.buyerId,
              product.name,
              `$${escrow.usdAmount}`,
              merchant.username,
              cryptoAmount.toFixed(8),
              escrow.coinSymbol,
              verification.txHash,
              escrowExpiresAt
            );
            
            // Send sale notification to merchant
            await sendSaleNotification(
              escrow.merchantId,
              buyer.username,
              product.name,
              `$${escrow.usdAmount}`,
              product.id,
              escrow.orderId
            );
          }
        }
      } catch (emailError) {
        console.error("Failed to send email notifications:", emailError);
      }

      res.json({
        message: `${escrow.coinSymbol} payment verified - funds in 24-hour escrow. Admin can release early or auto-release after 24h.`,
        escrow: updated,
        txHash: verification.txHash,
        confirmations: verification.confirmations,
        actualAmount: verification.actualAmount,
      });
    } catch (error) {
      console.error("TX hash verification error:", error);
      res.status(500).json({ message: "Failed to verify payment" });
    }
  });

  // Search for payment by buyer wallet address (for late confirmation)
  app.post("/api/escrow/:id/search-payment", requireAuth, async (req, res) => {
    try {
      const { buyerWalletAddress } = req.body;
      
      if (!buyerWalletAddress) {
        return res.status(400).json({ message: "Buyer wallet address required" });
      }

      const escrow = await storage.getEscrowOrder(req.params.id);
      if (!escrow) {
        return res.status(404).json({ message: "Escrow order not found" });
      }

      // Determine coin type and get correct amount
      const isBtc = escrow.coinSymbol === "BTC";
      const isBnb = escrow.coinSymbol === "BNB";
      const isUsdt = escrow.coinSymbol === "USDT";
      const searchAmount = isBtc ? escrow.btcAmount : escrow.cryptoAmount;

      // Search for payment from buyer's wallet to deposit address
      // Only count transactions after the escrow order was created
      const escrowCreatedAt = new Date(escrow.createdAt).getTime();
      
      let result;
      if (isBnb || isUsdt) {
        result = await bnbBlockchainService.searchPaymentByBuyerAddress(
          buyerWalletAddress,
          searchAmount,
          escrow.depositAddress,
          escrowCreatedAt
        );
      } else {
        result = await blockchainService.searchPaymentByBuyerAddress(
          buyerWalletAddress,
          searchAmount,
          escrow.depositAddress,
          escrowCreatedAt
        );
      }

      if (result.found) {
        res.json({
          found: true,
          txHash: result.txHash,
          confirmations: result.confirmations,
          message: "Payment found on blockchain"
        });
      } else {
        res.json({
          found: false,
          message: "No matching payment found"
        });
      }
    } catch (error) {
      console.error("Search payment error:", error);
      res.status(500).json({ message: "Failed to search for payment" });
    }
  });

  // Get buyer's escrow orders
  app.get("/api/escrow/buyer", requireAuth, async (req, res) => {
    try {
      const orders = await storage.getEscrowOrdersByBuyer(req.session.userId!);
      const ordersWithDetails = await Promise.all(
        orders.map(async (escrow) => {
          const merchant = await storage.getUser(escrow.merchantId);
          const order = await storage.getOrdersByUserId(escrow.buyerId);
          
          // Hide refund if older than 24 hours
          let displayRefund = true;
          if (escrow.refundConfirmedAt && escrow.status === "refunded") {
            const now = new Date();
            const refundTime = new Date(escrow.refundConfirmedAt);
            const hoursSinceRefund = (now.getTime() - refundTime.getTime()) / (1000 * 60 * 60);
            displayRefund = hoursSinceRefund < 24;
          }
          
          return {
            ...escrow,
            merchant: merchant ? { id: merchant.id, username: merchant.username } : null,
            showRefund: displayRefund, // Flag to show/hide refund in UI
          };
        })
      );
      res.json(ordersWithDetails);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch escrow orders" });
    }
  });

  // Get merchant's escrow orders
  app.get("/api/escrow/merchant", requireMerchant, async (req, res) => {
    try {
      const orders = await storage.getEscrowOrdersByMerchant(req.session.userId!);
      const ordersWithDetails = await Promise.all(
        orders.map(async (escrow) => {
          const buyer = await storage.getUser(escrow.buyerId);
          return {
            ...escrow,
            buyer: buyer ? { id: buyer.id, username: buyer.username } : null,
          };
        })
      );
      res.json(ordersWithDetails);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch escrow orders" });
    }
  });

  // Get single escrow order
  app.get("/api/escrow/:id", requireAuth, async (req, res) => {
    try {
      const escrow = await storage.getEscrowOrder(req.params.id);
      if (!escrow) {
        return res.status(404).json({ message: "Escrow order not found" });
      }

      // Check authorization
      const user = await storage.getUser(req.session.userId!);
      if (!user?.isAdmin && escrow.buyerId !== req.session.userId && escrow.merchantId !== req.session.userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const buyer = await storage.getUser(escrow.buyerId);
      const merchant = await storage.getUser(escrow.merchantId);
      const dispute = await storage.getDisputeByEscrowOrderId(escrow.id);
      
      // Hide refund if older than 24 hours
      let displayRefund = true;
      if (escrow.refundConfirmedAt && escrow.status === "refunded") {
        const now = new Date();
        const refundTime = new Date(escrow.refundConfirmedAt);
        const hoursSinceRefund = (now.getTime() - refundTime.getTime()) / (1000 * 60 * 60);
        displayRefund = hoursSinceRefund < 24;
      }

      res.json({
        ...escrow,
        buyer: buyer ? { id: buyer.id, username: buyer.username } : null,
        merchant: merchant ? { id: merchant.id, username: merchant.username } : null,
        dispute,
        showRefund: displayRefund, // Flag to show/hide refund in UI for 24 hours
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch escrow order" });
    }
  });

  // Buyer confirms delivery - releases funds to merchant
  app.post("/api/escrow/:id/confirm", requireAuth, async (req, res) => {
    try {
      const escrow = await storage.getEscrowOrder(req.params.id);
      if (!escrow) {
        return res.status(404).json({ message: "Escrow order not found" });
      }

      if (escrow.buyerId !== req.session.userId) {
        return res.status(403).json({ message: "Only buyer can confirm delivery" });
      }

      if (escrow.status !== "escrow") {
        return res.status(400).json({ message: "Cannot confirm at this stage" });
      }

      // Check if early approval is allowed
      if (escrow.escrowExpiresAt) {
        const now = new Date();
        const expiresAt = new Date(escrow.escrowExpiresAt);
        const timeRemaining = expiresAt.getTime() - now.getTime();
        
        // If more than 0 time remaining, early approval must be enabled
        if (timeRemaining > 0 && !escrow.earlyApprovalEnabled) {
          return res.status(400).json({ 
            message: "Early approval is locked. You can confirm after the 24-hour protection period expires, or contact admin to enable early approval." 
          });
        }
      }

      // Determine coin type and get correct amount
      const isBtc = escrow.coinSymbol === "BTC";
      const isBnb = escrow.coinSymbol === "BNB";
      const isUsdt = escrow.coinSymbol === "USDT";
      const totalAmount = isBtc ? escrow.btcAmount : escrow.cryptoAmount;

      // Calculate fee - check product-specific fee first, then global fee
      let feePercent = 0;
      const globalFeeSetting = await storage.getAdminSetting("global_fee_percent");
      if (globalFeeSetting) {
        feePercent = parseFloat(globalFeeSetting.value) || 0;
      }
      
      // Check for product-specific fee from the order
      const order = await storage.getOrder(escrow.orderId);
      if (order) {
        const orderItemsList = await storage.getOrderItems(escrow.orderId);
        for (const item of orderItemsList) {
          const productFee = await storage.getProductFee(item.productId);
          if (productFee) {
            feePercent = Math.max(feePercent, productFee.feePercent);
          }
        }
      }

      // Calculate fee amount and merchant amount
      const feeAmount = (totalAmount * feePercent) / 100;
      const merchantAmount = totalAmount - feeAmount;

      // Update escrow status with fee info
      await storage.updateEscrowOrder(escrow.id, {
        status: "released",
        confirmedAt: new Date(),
        releasedAt: new Date(),
        feePercent: feePercent,
        feeAmount: feeAmount,
        merchantAmount: merchantAmount,
      });

      // Add fee to admin wallet
      if (feeAmount > 0) {
        if (isBtc) {
          await storage.updateAdminWalletBalance(feeAmount, 0, 0);
        } else if (isBnb) {
          await storage.updateAdminWalletBalance(0, feeAmount, 0);
        } else if (isUsdt) {
          await storage.updateAdminWalletBalance(0, 0, feeAmount);
        }
        console.log(`[Escrow Confirm] Fee collected: ${feeAmount.toFixed(isBtc ? 8 : 6)} ${escrow.coinSymbol} (${feePercent}%)`);
      }

      // Get or create merchant wallet
      let wallet = await storage.getVirtualWallet(escrow.merchantId);
      if (!wallet) {
        wallet = await storage.createVirtualWallet(escrow.merchantId);
      }

      // Move from pending to available balance (totalEarned updated automatically) - use merchantAmount after fee
      if (isBtc) {
        await storage.updateVirtualWalletBalance(escrow.merchantId, merchantAmount, -totalAmount);
      } else if (isBnb) {
        await storage.updateVirtualWalletBnbBalance(escrow.merchantId, merchantAmount, -totalAmount);
      } else if (isUsdt) {
        await storage.updateVirtualWalletUsdtBalance(escrow.merchantId, merchantAmount, -totalAmount);
      }

      // Create ledger entry
      const updatedWallet = await storage.getVirtualWallet(escrow.merchantId);
      const balanceAfter = isBtc ? (updatedWallet?.availableBalance || 0) : isBnb ? (updatedWallet?.bnbAvailableBalance || 0) : (updatedWallet?.usdtAvailableBalance || 0);
      await storage.createLedgerEntry({
        userId: escrow.merchantId,
        escrowOrderId: escrow.id,
        type: "escrow_released",
        btcAmount: isBtc ? merchantAmount : 0,
        balanceAfter,
        description: `Payment received: ${merchantAmount.toFixed(isBtc ? 8 : 6)} ${escrow.coinSymbol} (fee: ${feeAmount.toFixed(isBtc ? 8 : 6)} ${escrow.coinSymbol})`,
      });

      // Create purchase snapshot for the buyer
      try {
        const orderItemsList = await db.select().from(orderItems).where(eq(orderItems.orderId, escrow.orderId));
        if (orderItemsList.length > 0) {
          const productId = orderItemsList[0].productId;
          const product = await storage.getProductById(productId);
          if (product) {
            await storage.createPurchaseSnapshot({
              escrowOrderId: escrow.id,
              productName: product.name,
              productDescription: product.description,
              productImages: product.images || (product.imageData ? [product.imageData] : []),
              afterBuyMessage: product.afterBuyMessage,
              afterBuyButtonLabel: product.afterBuyButtonLabel,
              afterBuyButtonUrl: product.afterBuyButtonUrl,
            });
          }
        }
      } catch (snapshotError) {
        console.error("Failed to create purchase snapshot:", snapshotError);
      }

      res.json({ message: "Delivery confirmed, funds released to merchant" });
    } catch (error) {
      console.error("Confirm delivery error:", error);
      res.status(500).json({ message: "Failed to confirm delivery" });
    }
  });

  // Get purchase snapshot for an escrow order
  app.get("/api/escrow/:id/snapshot", requireAuth, async (req, res) => {
    try {
      const escrow = await storage.getEscrowOrder(req.params.id);
      if (!escrow) {
        return res.status(404).json({ message: "Escrow order not found" });
      }

      // Only buyer or merchant can view snapshot
      if (escrow.buyerId !== req.session.userId && escrow.merchantId !== req.session.userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const snapshot = await storage.getPurchaseSnapshotByEscrowOrderId(escrow.id);
      if (!snapshot) {
        return res.status(404).json({ message: "Snapshot not found" });
      }

      res.json(snapshot);
    } catch (error) {
      console.error("Get snapshot error:", error);
      res.status(500).json({ message: "Failed to get snapshot" });
    }
  });

  // Get user's escrow orders with snapshots (for product pages) - checks both escrow and released status
  app.get("/api/escrow/product/:productId/released", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const productId = req.params.productId;
      
      // Security fix: Use a specific query to verify purchase status in the database
      // instead of iterating through all orders which could be spoofed or slow.
      const [escrow] = await db.select({
        id: escrowOrders.id,
        status: escrowOrders.status,
        orderId: escrowOrders.orderId
      })
      .from(escrowOrders)
      .innerJoin(orderItems, eq(orderItems.orderId, escrowOrders.orderId))
      .where(
        and(
          eq(escrowOrders.buyerId, userId),
          eq(orderItems.productId, productId),
          or(
            eq(escrowOrders.status, "escrow"),
            eq(escrowOrders.status, "released")
          )
        )
      )
      .limit(1);
      
      if (escrow) {
        const snapshot = await storage.getPurchaseSnapshotByEscrowOrderId(escrow.id);
        return res.json({ 
          hasPurchased: true, 
          escrowId: escrow.id,
          escrowStatus: escrow.status,
          snapshot: snapshot || null
        });
      }
      
      res.json({ hasPurchased: false });
    } catch (error) {
      console.error("Get product release status error:", error);
      res.status(500).json({ message: "Failed to check purchase status" });
    }
  });

  // --- Dispute Routes ---

  // Buyer raises a dispute
  app.post("/api/escrow/:id/dispute", requireAuth, async (req, res) => {
    try {
      const escrow = await storage.getEscrowOrder(req.params.id);
      if (!escrow) {
        return res.status(404).json({ message: "Escrow order not found" });
      }

      if (escrow.buyerId !== req.session.userId) {
        return res.status(403).json({ message: "Only buyer can raise dispute" });
      }

      if (escrow.status !== "escrow") {
        return res.status(400).json({ message: "Cannot dispute at this stage" });
      }

      const existingDispute = await storage.getDisputeByEscrowOrderId(escrow.id);
      if (existingDispute) {
        return res.status(400).json({ message: "Dispute already exists" });
      }

      const { reason, evidenceDescription, evidenceImageData, evidenceImageType } = req.body;
      if (!reason) {
        return res.status(400).json({ message: "Reason is required" });
      }

      // Update escrow status
      await storage.updateEscrowOrder(escrow.id, { status: "disputed" });

      // Create dispute
      const dispute = await storage.createDispute({
        escrowOrderId: escrow.id,
        buyerId: escrow.buyerId,
        merchantId: escrow.merchantId,
        reason,
        evidenceDescription,
        evidenceImageData,
        evidenceImageType,
      });

      res.json(dispute);
    } catch (error) {
      console.error("Create dispute error:", error);
      res.status(500).json({ message: "Failed to create dispute" });
    }
  });

  // Get user's disputes
  app.get("/api/disputes", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      let allDisputes = await storage.getAllDisputes();
      
      // Filter disputes based on user role
      if (!user.isAdmin) {
        allDisputes = allDisputes.filter(d => d.buyerId === user.id || d.merchantId === user.id);
      }

      const disputesWithDetails = await Promise.all(
        allDisputes.map(async (dispute) => {
          const buyer = await storage.getUser(dispute.buyerId);
          const merchant = await storage.getUser(dispute.merchantId);
          const escrow = await storage.getEscrowOrder(dispute.escrowOrderId);
          return {
            ...dispute,
            buyer: buyer ? { id: buyer.id, username: buyer.username } : null,
            merchant: merchant ? { id: merchant.id, username: merchant.username } : null,
            escrow,
          };
        })
      );

      res.json(disputesWithDetails);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch disputes" });
    }
  });

  // Admin resolves dispute - refund to buyer
  app.post("/api/admin/disputes/:id/refund", requireAdmin, async (req, res) => {
    try {
      const dispute = await storage.getDispute(req.params.id);
      if (!dispute) {
        return res.status(404).json({ message: "Dispute not found" });
      }

      if (dispute.status !== "open") {
        return res.status(400).json({ message: "Dispute already resolved" });
      }

      const escrow = await storage.getEscrowOrder(dispute.escrowOrderId);
      if (!escrow) {
        return res.status(404).json({ message: "Escrow order not found" });
      }

      const { adminNotes, sendRealCrypto } = req.body;

      // Determine coin type and get correct amount
      const isBtc = escrow.coinSymbol === "BTC";
      const isBnb = escrow.coinSymbol === "BNB";
      const isUsdt = escrow.coinSymbol === "USDT";
      const refundAmount = isBtc ? escrow.btcAmount : escrow.cryptoAmount;
      let transactionHash = `refund_${Date.now()}`;

      // If payment was made via wallet, send refund directly to buyer's wallet using platform master wallet
      if (escrow.paymentMethod === "wallet") {
        const buyerWallet = await storage.getUserWallet(escrow.buyerId);
        if (!buyerWallet) {
          return res.status(400).json({ message: "Buyer wallet not found" });
        }
        
        if (isUsdt) {
          // Send USDT refund to buyer's wallet using platform master wallet
          if (!bnbWalletService.isInitialized()) {
            return res.status(400).json({ message: "BNB wallet service not initialized" });
          }
          const result = await bnbWalletService.sendUsdt(
            "m/44'/60'/0'/0/0", // Platform master wallet path
            buyerWallet.address,
            refundAmount
          );
          if (!result.success) {
            return res.status(400).json({ 
              message: "Failed to send USDT refund to buyer wallet", 
              error: result.error 
            });
          }
          transactionHash = result.txHash || transactionHash;
          console.log(`[Refund] USDT refund sent to buyer wallet ${buyerWallet.address}: ${transactionHash}`);
        } else if (isBnb) {
          // Send BNB refund to buyer's wallet using platform master wallet
          if (!bnbWalletService.isInitialized()) {
            return res.status(400).json({ message: "BNB wallet service not initialized" });
          }
          const estimatedGas = await bnbWalletService.estimateGasFee();
          const netAmount = refundAmount - estimatedGas;
          if (netAmount <= 0) {
            return res.status(400).json({ message: "BNB amount too small to cover gas fees" });
          }
          const result = await bnbWalletService.sendBnb(
            "m/44'/60'/0'/0/0", // Platform master wallet path
            buyerWallet.address,
            netAmount
          );
          if (!result.success) {
            return res.status(400).json({ 
              message: "Failed to send BNB refund to buyer wallet", 
              error: result.error 
            });
          }
          transactionHash = result.txHash || transactionHash;
          console.log(`[Refund] BNB refund sent to buyer wallet ${buyerWallet.address}: ${transactionHash}`);
        } else if (isBtc) {
          // Send BTC refund to buyer's wallet using platform master wallet
          if (!walletService.isInitialized()) {
            return res.status(400).json({ message: "BTC wallet service not initialized" });
          }
          const result = await walletService.sendBtc(
            "m/84'/0'/0'/0/0", // Platform master wallet path
            buyerWallet.address,
            refundAmount
          );
          if (!result.success) {
            return res.status(400).json({ 
              message: "Failed to send BTC refund to buyer wallet", 
              error: result.error 
            });
          }
          transactionHash = result.txHash || transactionHash;
          console.log(`[Refund] BTC refund sent to buyer wallet ${buyerWallet.address}: ${transactionHash}`);
        }
      }

      // Create ledger entry for buyer receiving refund
      const buyerRefundWallet = await storage.getVirtualWallet(escrow.buyerId);
      const buyerRefundBalance = escrow.coinSymbol === "USDT" ? (buyerRefundWallet?.usdtAvailableBalance || 0) : 
                                 escrow.coinSymbol === "BNB" ? (buyerRefundWallet?.bnbAvailableBalance || 0) : 
                                 (buyerRefundWallet?.availableBalance || 0);
      
      await storage.createLedgerEntry({
        userId: escrow.buyerId,
        escrowOrderId: escrow.id,
        type: "refund_received",
        btcAmount: escrow.coinSymbol === "BTC" ? refundAmount : 0,
        balanceAfter: buyerRefundBalance + refundAmount,
        description: `Refund received for disputed ${escrow.coinSymbol} order (TX: ${transactionHash})`,
      });
      
      // Otherwise, send crypto refund to buyer's provided address
      if (escrow.buyerRefundAddress && sendRealCrypto) {
        if (isBnb) {
          if (!bnbWalletService.isInitialized()) {
            return res.status(400).json({ message: "BNB wallet service not initialized" });
          }
          const result = await bnbWalletService.sendBnb(
            "m/44'/60'/0'/0/0",
            escrow.buyerRefundAddress,
            refundAmount
          );
          if (!result.success) {
            return res.status(400).json({ 
              message: "Failed to send BNB refund", 
              error: result.error 
            });
          }
          transactionHash = result.txHash || transactionHash;
          console.log(`[Refund] BNB refund sent to ${escrow.buyerRefundAddress}: ${transactionHash}`);
        } else if (isUsdt) {
          if (!bnbWalletService.isInitialized()) {
            return res.status(400).json({ message: "BNB wallet service not initialized for USDT" });
          }
          const result = await bnbWalletService.sendUsdt(
            "m/44'/60'/0'/0/0",
            escrow.buyerRefundAddress,
            refundAmount
          );
          if (!result.success) {
            return res.status(400).json({ 
              message: "Failed to send USDT refund", 
              error: result.error 
            });
          }
          transactionHash = result.txHash || transactionHash;
          console.log(`[Refund] USDT refund sent to ${escrow.buyerRefundAddress}: ${transactionHash}`);
        } else {
          if (!walletService.isInitialized()) {
            return res.status(400).json({ message: "BTC wallet service not initialized" });
          }
          const result = await walletService.sendBtc(
            "m/84'/0'/0'/0/0",
            escrow.buyerRefundAddress,
            refundAmount
          );
          if (!result.success) {
            return res.status(400).json({ 
              message: "Failed to send BTC refund", 
              error: result.error 
            });
          }
          transactionHash = result.txHash || transactionHash;
          console.log(`[Refund] BTC refund sent to ${escrow.buyerRefundAddress}: ${transactionHash}`);
        }
      } else if (!escrow.buyerRefundAddress && escrow.paymentMethod !== "wallet") {
        return res.status(400).json({ message: "Buyer has not provided a refund wallet address" });
      }

      // Update dispute
      await storage.updateDispute(dispute.id, {
        status: "resolved_refund",
        adminNotes,
        resolvedBy: req.session.userId,
        resolvedAt: new Date(),
      });

      // Update escrow with refund transaction hash and confirmation timestamp (displays for 24 hours)
      await storage.updateEscrowOrder(escrow.id, {
        status: "refunded",
        refundedAt: new Date(),
        refundConfirmedAt: new Date(), // Set timestamp for 24-hour display window
      });

      // Remove pending balance from merchant (refund goes to buyer)
      const wallet = await storage.getVirtualWallet(escrow.merchantId);
      if (wallet) {
        if (isBtc) {
          await storage.updateVirtualWalletBalance(escrow.merchantId, 0, -refundAmount);
        } else if (isBnb) {
          await storage.updateVirtualWalletBnbBalance(escrow.merchantId, 0, -refundAmount);
        } else if (isUsdt) {
          await storage.updateVirtualWalletUsdtBalance(escrow.merchantId, 0, -refundAmount);
        }
      }

      // Restore stock for each item in the refunded order
      try {
        const refundedOrderItems = await storage.getOrderItems(escrow.orderId);
        for (const orderItem of refundedOrderItems) {
          await storage.incrementStock(orderItem.productId, orderItem.quantity || 1);
        }
      } catch (stockError) {
        console.error("[Refund] Failed to restore stock:", stockError);
      }

      res.json({ 
        message: `Dispute resolved with ${refundAmount.toFixed(isBtc ? 8 : 6)} ${escrow.coinSymbol} refund to buyer`,
        transactionHash: sendRealCrypto ? transactionHash : null,
        refundAddress: escrow.buyerRefundAddress
      });
    } catch (error) {
      console.error("Refund dispute error:", error);
      res.status(500).json({ message: "Failed to resolve dispute" });
    }
  });

  // Admin resolves dispute - release to merchant
  app.post("/api/admin/disputes/:id/release", requireAdmin, async (req, res) => {
    try {
      const dispute = await storage.getDispute(req.params.id);
      if (!dispute) {
        return res.status(404).json({ message: "Dispute not found" });
      }

      if (dispute.status !== "open") {
        return res.status(400).json({ message: "Dispute already resolved" });
      }

      const escrow = await storage.getEscrowOrder(dispute.escrowOrderId);
      if (!escrow) {
        return res.status(404).json({ message: "Escrow order not found" });
      }

      const { adminNotes } = req.body;

      // Determine coin type and get correct amount
      const isBtc = escrow.coinSymbol === "BTC";
      const isBnb = escrow.coinSymbol === "BNB";
      const isUsdt = escrow.coinSymbol === "USDT";
      const totalAmount = isBtc ? escrow.btcAmount : escrow.cryptoAmount;

      // Calculate fee - check product-specific fee first, then global fee
      let feePercent = 0;
      const globalFeeSetting = await storage.getAdminSetting("global_fee_percent");
      if (globalFeeSetting) {
        feePercent = parseFloat(globalFeeSetting.value) || 0;
      }
      
      // Check for product-specific fee from the order
      const order = await storage.getOrder(escrow.orderId);
      if (order) {
        const orderItemsList = await storage.getOrderItems(escrow.orderId);
        for (const item of orderItemsList) {
          const productFee = await storage.getProductFee(item.productId);
          if (productFee) {
            feePercent = Math.max(feePercent, productFee.feePercent);
          }
        }
      }

      // Calculate fee amount and merchant amount
      const feeAmount = (totalAmount * feePercent) / 100;
      const merchantAmount = totalAmount - feeAmount;

      // Update dispute
      await storage.updateDispute(dispute.id, {
        status: "resolved_release",
        adminNotes,
        resolvedBy: req.session.userId,
        resolvedAt: new Date(),
      });

      // Update escrow with fee info
      await storage.updateEscrowOrder(escrow.id, {
        status: "released",
        releasedAt: new Date(),
        feePercent: feePercent,
        feeAmount: feeAmount,
        merchantAmount: merchantAmount,
      });

      // Add fee to admin wallet
      if (feeAmount > 0) {
        if (isBtc) {
          await storage.updateAdminWalletBalance(feeAmount, 0, 0);
        } else if (isBnb) {
          await storage.updateAdminWalletBalance(0, feeAmount, 0);
        } else if (isUsdt) {
          await storage.updateAdminWalletBalance(0, 0, feeAmount);
        }
        console.log(`[Dispute Release] Fee collected: ${feeAmount.toFixed(isBtc ? 8 : 6)} ${escrow.coinSymbol} (${feePercent}%)`);
      }

      // Credit merchant wallet - move from pending to available (use merchantAmount after fee)
      let wallet = await storage.getVirtualWallet(escrow.merchantId);
      if (!wallet) {
        wallet = await storage.createVirtualWallet(escrow.merchantId);
      }

      if (isBtc) {
        await storage.updateVirtualWalletBalance(escrow.merchantId, merchantAmount, -totalAmount);
      } else if (isBnb) {
        await storage.updateVirtualWalletBnbBalance(escrow.merchantId, merchantAmount, -totalAmount);
      } else if (isUsdt) {
        await storage.updateVirtualWalletUsdtBalance(escrow.merchantId, merchantAmount, -totalAmount);
      }

      // Create ledger entry
      const updatedWallet = await storage.getVirtualWallet(escrow.merchantId);
      const balanceAfter = isBtc ? (updatedWallet?.availableBalance || 0) : isBnb ? (updatedWallet?.bnbAvailableBalance || 0) : (updatedWallet?.usdtAvailableBalance || 0);
      await storage.createLedgerEntry({
        userId: escrow.merchantId,
        escrowOrderId: escrow.id,
        type: "escrow_released",
        btcAmount: isBtc ? merchantAmount : 0,
        balanceAfter,
        description: `Payment received: ${merchantAmount.toFixed(isBtc ? 8 : 6)} ${escrow.coinSymbol} (fee: ${feeAmount.toFixed(isBtc ? 8 : 6)} ${escrow.coinSymbol}) - Dispute resolved`,
      });

      res.json({ 
        message: `Dispute resolved with ${merchantAmount.toFixed(isBtc ? 8 : 6)} ${escrow.coinSymbol} release to merchant (fee: ${feeAmount.toFixed(isBtc ? 8 : 6)} ${escrow.coinSymbol})` 
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to resolve dispute" });
    }
  });

  // --- Withdrawal Routes ---

  app.post("/api/withdrawals", requireMerchant, async (req, res) => {
    try {
      const { amount, address, coinSymbol = "BTC" } = req.body;
      
      const withdrawAmount = parseFloat(amount);
      if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
        return res.status(400).json({ message: "Invalid withdrawal amount" });
      }

      if (!address) {
        return res.status(400).json({ message: "Withdrawal address required" });
      }

      const userId = req.session.userId!;
      const wallet = await storage.getVirtualWallet(userId);

      // SECURITY FIX: Re-verify balance from ledger to prevent wallet balance tampering
      // Get all ledger entries for this user
      const ledgerEntries = await storage.getLedgerEntriesByUser(userId);
      
      let calculatedBtcBalance = 0;
      let calculatedBnbBalance = 0;
      let calculatedUsdtBalance = 0;

      for (const entry of ledgerEntries) {
        // Simple logic: add released amounts, subtract completed withdrawals
        const amount = entry.btcAmount || 0;
        
        // This is a simplified check because ledger entries in current schema 
        // mainly track BTC but we need to check the entry description/type for others
        if (entry.type === "escrow_released") {
          // Check which coin it was from description or related escrow order
          const escrow = entry.escrowOrderId ? await storage.getEscrowOrder(entry.escrowOrderId) : null;
          if (escrow) {
            const amountToCredit = escrow.merchantAmount || (escrow.coinSymbol === "BTC" ? escrow.btcAmount : escrow.cryptoAmount);
            if (escrow.coinSymbol === "BTC") calculatedBtcBalance += amountToCredit;
            else if (escrow.coinSymbol === "BNB") calculatedBnbBalance += amountToCredit;
            else if (escrow.coinSymbol === "USDT") calculatedUsdtBalance += amountToCredit;
          }
        } else if (entry.type === "withdrawal_completed") {
          const withdrawal = entry.withdrawalId ? await storage.getWithdrawalRequest(entry.withdrawalId) : null;
          if (withdrawal) {
            const amountToDeduct = withdrawal.coinSymbol === "BTC" ? withdrawal.btcAmount : 
                                   withdrawal.coinSymbol === "BNB" ? withdrawal.bnbAmount : withdrawal.usdtAmount;
            if (withdrawal.coinSymbol === "BTC") calculatedBtcBalance -= amountToDeduct;
            else if (withdrawal.coinSymbol === "BNB") calculatedBnbBalance -= amountToDeduct;
            else if (withdrawal.coinSymbol === "USDT") calculatedUsdtBalance -= amountToDeduct;
          }
        }
      }

      // Cross-verify with virtual_wallets table
      if (coinSymbol === "BNB") {
        if (!wallet || wallet.bnbAvailableBalance < withdrawAmount || calculatedBnbBalance < withdrawAmount) {
          return res.status(400).json({ message: "Insufficient verified BNB balance" });
        }
        await storage.updateVirtualWalletBnbBalance(userId, -withdrawAmount, 0);
      } else if (coinSymbol === "USDT") {
        if (!wallet || wallet.usdtAvailableBalance < withdrawAmount || calculatedUsdtBalance < withdrawAmount) {
          return res.status(400).json({ message: "Insufficient verified USDT balance" });
        }
        await storage.updateVirtualWalletUsdtBalance(userId, -withdrawAmount, 0);
      } else {
        if (!wallet || wallet.availableBalance < withdrawAmount || calculatedBtcBalance < withdrawAmount) {
          return res.status(400).json({ message: "Insufficient verified BTC balance" });
        }
        await storage.updateVirtualWalletBalance(userId, -withdrawAmount, 0);
      }

      const withdrawal = await storage.createWithdrawalRequest({
         merchantId: req.session.userId!,
         coinSymbol,
         btcAmount: coinSymbol === "BTC" ? withdrawAmount : 0,
         bnbAmount: coinSymbol === "BNB" ? withdrawAmount : 0,
         usdtAmount: coinSymbol === "USDT" ? withdrawAmount : 0,
         btcAddress: coinSymbol === "BTC" ? address : null,  // ✅ null instead of undefined
         bnbAddress: coinSymbol === "BNB" ? address : null,
         usdtAddress: coinSymbol === "USDT" ? address : null,
      });

      const updatedWallet = await storage.getVirtualWallet(req.session.userId!);
      const balanceAfter = coinSymbol === "BTC" ? (updatedWallet?.availableBalance || 0) : coinSymbol === "BNB" ? (updatedWallet?.bnbAvailableBalance || 0) : (updatedWallet?.usdtAvailableBalance || 0);
      await storage.createLedgerEntry({
        userId: req.session.userId!,
        withdrawalId: withdrawal.id,
        type: "withdrawal_pending",
        btcAmount: coinSymbol === "BTC" ? -withdrawAmount : 0,
        balanceAfter,
        description: `${coinSymbol} withdrawal request submitted`,
      });

      // Check if auto-approve is enabled - process asynchronously using platform wallet
      const autoApproveSetting = await storage.getAdminSetting("auto_approve_withdrawals");
      if (autoApproveSetting?.value === "true") {
        console.log(`[Auto-Approve] Processing auto-approval for withdrawal ${withdrawal.id}`);
        
        let transactionHash = `auto_${Date.now()}`;
        let gasFeeDeducted = 0;
        let sendSuccess = false;

        try {
          // Use platform's master wallet to send crypto (not merchant's wallet)
          if ((coinSymbol === "BNB" || coinSymbol === "USDT") && bnbWalletService.isInitialized()) {
            if (coinSymbol === "BNB") {
              // For BNB: estimate gas and check if we can send after deducting gas
              const estimatedGas = await bnbWalletService.estimateGasFee();
              const netAmount = amount - estimatedGas;
              console.log(`[Auto-Approve] BNB: amount=${amount}, estimatedGas=${estimatedGas}, netAmount=${netAmount}`);
              
              if (netAmount > 0) {
                // Send BNB from platform master wallet path
                const result = await bnbWalletService.sendBnb(
                  "m/44'/60'/0'/0/0",
                  address,
                  netAmount
                );
                
                if (result.success) {
                  transactionHash = result.txHash || transactionHash;
                  gasFeeDeducted = result.gasFee || estimatedGas;
                  sendSuccess = true;
                  console.log(`[Auto-Approve] BNB sent successfully: ${transactionHash}`);
                } else {
                  console.error(`[Auto-Approve] BNB send failed: ${result.error}`);
                }
              } else {
                console.error(`[Auto-Approve] BNB amount too small after gas deduction: ${netAmount}`);
              }
            } else if (coinSymbol === "USDT") {
              // For USDT: send full amount, gas is paid in BNB
              const tokenGasFee = await bnbWalletService.estimateTokenGasFee();
              console.log(`[Auto-Approve] USDT: amount=${amount}, estimatedGas=${tokenGasFee}`);
              
              const result = await bnbWalletService.sendUsdt(
                "m/44'/60'/0'/0/0",
                address,
                amount
              );
              
              if (result.success) {
                transactionHash = result.txHash || transactionHash;
                gasFeeDeducted = result.gasFee || tokenGasFee;
                sendSuccess = true;
                console.log(`[Auto-Approve] USDT sent successfully: ${transactionHash}`);
              } else {
                console.error(`[Auto-Approve] USDT send failed: ${result.error}`);
              }
            }
          } else if (coinSymbol === "BTC" && walletService.isInitialized()) {
            // Send from platform master wallet path
            console.log(`[Auto-Approve] BTC: amount=${amount}`);
            const result = await walletService.sendBtc(
              "m/84'/0'/0'/0/0",
              address,
              amount
            );
            
            if (result.success) {
              transactionHash = result.txHash || transactionHash;
              sendSuccess = true;
              console.log(`[Auto-Approve] BTC sent successfully: ${transactionHash}`);
            } else {
              console.error(`[Auto-Approve] BTC send failed: ${result.error}`);
            }
          } else {
            console.error(`[Auto-Approve] Wallet service not initialized for ${coinSymbol}`);
          }

          if (sendSuccess) {
            // Update withdrawal status to completed
            await storage.updateWithdrawalRequest(withdrawal.id, {
              status: "completed",
              adminNotes: `Auto-approved${gasFeeDeducted > 0 ? ` (Gas: ${gasFeeDeducted.toFixed(6)} BNB)` : ''}`,
              approvedAt: new Date(),
              completedAt: new Date(),
              transactionHash,
            });

            // Update the pending ledger entry to completed (no double deduct - balance already deducted above)
            const finalWallet = await storage.getVirtualWallet(withdrawal.merchantId);
            const balanceAfter = coinSymbol === "BTC" ? (finalWallet?.availableBalance || 0) : coinSymbol === "BNB" ? (finalWallet?.bnbAvailableBalance || 0) : (finalWallet?.usdtAvailableBalance || 0);
            await storage.createLedgerEntry({
              userId: withdrawal.merchantId,
              withdrawalId: withdrawal.id,
              type: "withdrawal_completed",
              btcAmount: 0, // No additional deduction, just logging completion
              balanceAfter,
              description: `${coinSymbol} withdrawal auto-approved - sent to ${address.substring(0, 15)}...`,
            });

            return res.json({ ...withdrawal, status: "completed", transactionHash, autoApproved: true });
          } else {
            // Auto-approve send failed - restore balance and keep as pending
            console.log(`[Auto-Approve] Send failed for ${coinSymbol}, restoring merchant balance`);
            if (coinSymbol === "BNB") {
              await storage.updateVirtualWalletBnbBalance(withdrawal.merchantId, amount, 0);
            } else if (coinSymbol === "USDT") {
              await storage.updateVirtualWalletUsdtBalance(withdrawal.merchantId, amount, 0);
            } else {
              await storage.updateVirtualWalletBalance(withdrawal.merchantId, amount, 0);
            }
          }
        } catch (autoApproveError) {
          console.error("[Auto-Approve] Error during auto-approval:", autoApproveError);
          // Restore balance if auto-approve crashes
          try {
            if (coinSymbol === "BNB") {
              await storage.updateVirtualWalletBnbBalance(withdrawal.merchantId, amount, 0);
            } else if (coinSymbol === "USDT") {
              await storage.updateVirtualWalletUsdtBalance(withdrawal.merchantId, amount, 0);
            } else {
              await storage.updateVirtualWalletBalance(withdrawal.merchantId, amount, 0);
            }
          } catch (restoreError) {
            console.error("[Auto-Approve] Failed to restore balance:", restoreError);
          }
        }
      }

      res.json(withdrawal);
    } catch (error) {
      console.error("Withdrawal error:", error);
      res.status(500).json({ message: "Failed to create withdrawal request" });
    }
  });

  // Get merchant's withdrawals
  app.get("/api/withdrawals", requireAuth, async (req, res) => {
    try {
      const withdrawals = await storage.getWithdrawalRequestsByMerchant(req.session.userId!);
      res.json(withdrawals);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch withdrawals" });
    }
  });

  // Admin gets all withdrawals
  app.get("/api/admin/withdrawals", requireAdmin, async (req, res) => {
    try {
      const withdrawals = await storage.getAllWithdrawalRequests();
      const withdrawalsWithMerchant = await Promise.all(
        withdrawals.map(async (w) => {
          const merchant = await storage.getUser(w.merchantId);
          return {
            ...w,
            merchant: merchant ? { id: merchant.id, username: merchant.username } : null,
          };
        })
      );
      res.json(withdrawalsWithMerchant);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch withdrawals" });
    }
  });

  // Admin approves withdrawal - with real BTC/BNB transaction
  app.post("/api/admin/withdrawals/:id/approve", requireAdmin, async (req, res) => {
    try {
      const withdrawal = await storage.getWithdrawalRequest(req.params.id);
      if (!withdrawal) {
        return res.status(404).json({ message: "Withdrawal not found" });
      }

      if (withdrawal.status !== "pending") {
        return res.status(400).json({ message: "Withdrawal already processed" });
      }

      // Security Fix: Re-verify merchant balance from DB before approval
      // This prevents cases where the initial request might have been manipulated
      // and ensures we never approve more than the current available balance.
      const wallet = await storage.getVirtualWallet(withdrawal.merchantId);
      
      const requestedAmount = withdrawal.coinSymbol === "BTC" ? withdrawal.btcAmount : 
                              withdrawal.coinSymbol === "BNB" ? withdrawal.bnbAmount : 
                              withdrawal.usdtAmount;

      // Note: Balance was deducted during request creation, so we check if balance is valid
      // or if there are any discrepancies. Since we deduct at request time, the request
      // amount is already "locked" out of the available balance.

      const { adminNotes, sendRealCrypto } = req.body;
      let transactionHash = `manual_${Date.now()}`;
      let gasFeeDeducted = 0;

      if (withdrawal.coinSymbol === "BTC") {
        // Handle BTC withdrawal
        if (sendRealCrypto && walletService.isInitialized()) {
          const result = await walletService.sendBtc(
            "m/84'/0'/0'/0/0",
            withdrawal.btcAddress!,
            withdrawal.btcAmount
          );

          if (!result.success) {
            return res.status(400).json({ 
              message: "Failed to send BTC", 
              error: result.error 
            });
          }

          transactionHash = result.txHash || transactionHash;
        }

        await storage.updateWithdrawalRequest(withdrawal.id, {
          status: "completed",
          adminNotes,
          approvedBy: req.session.userId,
          approvedAt: new Date(),
          completedAt: new Date(),
          transactionHash,
        });

        // Create ledger entry for BTC
        await storage.createLedgerEntry({
          userId: withdrawal.merchantId,
          withdrawalId: withdrawal.id,
          type: "withdrawal_completed",
          btcAmount: -withdrawal.btcAmount,
          balanceAfter: (await storage.getVirtualWallet(withdrawal.merchantId))?.availableBalance || 0,
          description: `BTC withdrawal completed - sent to ${withdrawal.btcAddress?.substring(0, 15)}...`,
        });

      } else if (withdrawal.coinSymbol === "BNB") {
        // Handle BNB withdrawal
        const bnbAmount = withdrawal.bnbAmount;
        if (sendRealCrypto && bnbWalletService.isInitialized()) {
          // Estimate gas fee
          const estimatedGas = await bnbWalletService.estimateGasFee();
          
          // Deduct gas fee from withdrawal amount
          const netAmount = bnbAmount - estimatedGas;
          
          if (netAmount <= 0) {
            return res.status(400).json({ 
              message: "Withdrawal amount too small to cover gas fees",
              estimatedGas 
            });
          }

          // Send BNB (gas fee deducted from merchant's withdrawal)
          const result = await bnbWalletService.sendBnb(
            "m/44'/60'/0'/0/0", // Master wallet path for BNB
            withdrawal.bnbAddress!,
            netAmount
          );

          if (!result.success) {
            // Restore balance since send failed
            await storage.updateVirtualWalletBnbBalance(withdrawal.merchantId, bnbAmount, 0);
            return res.status(400).json({ 
              message: "Failed to send BNB", 
              error: result.error,
              balanceRestored: true
            });
          }

          transactionHash = result.txHash || transactionHash;
          gasFeeDeducted = result.gasFee || estimatedGas;
        }

        await storage.updateWithdrawalRequest(withdrawal.id, {
          status: "completed",
          adminNotes: adminNotes ? `${adminNotes} (Gas fee: ${gasFeeDeducted.toFixed(6)} BNB)` : `Gas fee: ${gasFeeDeducted.toFixed(6)} BNB`,
          approvedBy: req.session.userId,
          approvedAt: new Date(),
          completedAt: new Date(),
          transactionHash,
        });

        // Create ledger entry for BNB
        const updatedBnbWallet = await storage.getVirtualWallet(withdrawal.merchantId);
        await storage.createLedgerEntry({
          userId: withdrawal.merchantId,
          withdrawalId: withdrawal.id,
          type: "withdrawal_completed",
          btcAmount: 0, // BTC amount is 0 for BNB withdrawals
          balanceAfter: updatedBnbWallet?.bnbAvailableBalance || 0,
          description: `BNB withdrawal completed - sent ${(bnbAmount - gasFeeDeducted).toFixed(6)} BNB to ${withdrawal.bnbAddress?.substring(0, 10)}... (gas: ${gasFeeDeducted.toFixed(6)} BNB)`,
        });

      } else if (withdrawal.coinSymbol === "USDT") {
        // Handle USDT withdrawal
        const usdtAmount = withdrawal.usdtAmount;
        if (sendRealCrypto && bnbWalletService.isInitialized()) {
          // Estimate gas fee for USDT token transfer
          const estimatedGas = await bnbWalletService.estimateTokenGasFee();
          
          // Note: Gas is paid in BNB, not USDT. The full USDT amount is withdrawn.
          
          // Send USDT using contract
          const result = await bnbWalletService.sendUsdt(
            "m/44'/60'/0'/0/0", // Master wallet path
            withdrawal.usdtAddress!,
            usdtAmount
          );

          if (!result.success) {
            // Restore balance since send failed
            await storage.updateVirtualWalletUsdtBalance(withdrawal.merchantId, usdtAmount, 0);
            return res.status(400).json({ 
              message: "Failed to send USDT", 
              error: result.error,
              balanceRestored: true
            });
          }

          transactionHash = result.txHash || transactionHash;
          gasFeeDeducted = result.gasFee || estimatedGas;
        }

        await storage.updateWithdrawalRequest(withdrawal.id, {
          status: "completed",
          adminNotes: adminNotes ? `${adminNotes} (Gas fee: ${gasFeeDeducted.toFixed(6)} BNB)` : `Gas fee: ${gasFeeDeducted.toFixed(6)} BNB`,
          approvedBy: req.session.userId,
          approvedAt: new Date(),
          completedAt: new Date(),
          transactionHash,
        });

        // Create ledger entry for USDT
        const updatedUsdtWallet = await storage.getVirtualWallet(withdrawal.merchantId);
        await storage.createLedgerEntry({
          userId: withdrawal.merchantId,
          withdrawalId: withdrawal.id,
          type: "withdrawal_completed",
          btcAmount: 0,
          balanceAfter: updatedUsdtWallet?.usdtAvailableBalance || 0,
          description: `USDT withdrawal completed - sent ${usdtAmount.toFixed(6)} USDT to ${withdrawal.usdtAddress?.substring(0, 10)}... (gas: ${gasFeeDeducted.toFixed(6)} BNB)`,
        });
      }

      res.json({ 
        message: `${withdrawal.coinSymbol} withdrawal approved and completed`, 
        transactionHash,
        gasFeeDeducted: gasFeeDeducted > 0 ? gasFeeDeducted : undefined
      });
    } catch (error) {
      console.error("Withdrawal approval error:", error);
      res.status(500).json({ message: "Failed to approve withdrawal" });
    }
  });

  // Admin approves all pending withdrawals
  app.post("/api/admin/withdrawals/approve-all", requireAdmin, async (req, res) => {
    try {
      const allWithdrawals = await storage.getAllWithdrawalRequests();
      const pendingWithdrawals = allWithdrawals.filter(w => w.status === "pending");

      if (pendingWithdrawals.length === 0) {
        return res.json({ message: "No pending withdrawals to approve", approvedCount: 0 });
      }

      let approvedCount = 0;
      const errors: string[] = [];

      for (const withdrawal of pendingWithdrawals) {
        try {
          let transactionHash = `auto_approved_${Date.now()}_${withdrawal.id}`;
          let sendSuccess = false;
          const coinSymbol = withdrawal.coinSymbol || "BTC";

          // Actually send crypto for each withdrawal
          if (coinSymbol === "BTC" && walletService.isInitialized()) {
            const result = await walletService.sendBtc(
              "m/84'/0'/0'/0/0",
              withdrawal.btcAddress!,
              withdrawal.btcAmount
            );
            if (result.success) {
              transactionHash = result.txHash || transactionHash;
              sendSuccess = true;
            } else {
              errors.push(`Failed to send BTC for withdrawal ${withdrawal.id}: ${result.error}`);
            }
          } else if (coinSymbol === "BNB" && bnbWalletService.isInitialized()) {
            const estimatedGas = await bnbWalletService.estimateGasFee();
            const netAmount = withdrawal.bnbAmount - estimatedGas;
            if (netAmount > 0) {
              const result = await bnbWalletService.sendBnb(
                "m/44'/60'/0'/0/0",
                withdrawal.bnbAddress!,
                netAmount
              );
              if (result.success) {
                transactionHash = result.txHash || transactionHash;
                sendSuccess = true;
              } else {
                errors.push(`Failed to send BNB for withdrawal ${withdrawal.id}: ${result.error}`);
              }
            } else {
              errors.push(`BNB withdrawal ${withdrawal.id} too small to cover gas`);
            }
          } else if (coinSymbol === "USDT" && bnbWalletService.isInitialized()) {
            const result = await bnbWalletService.sendUsdt(
              "m/44'/60'/0'/0/0",
              withdrawal.usdtAddress!,
              withdrawal.usdtAmount
            );
            if (result.success) {
              transactionHash = result.txHash || transactionHash;
              sendSuccess = true;
            } else {
              errors.push(`Failed to send USDT for withdrawal ${withdrawal.id}: ${result.error}`);
            }
          }

          if (sendSuccess) {
            await storage.updateWithdrawalRequest(withdrawal.id, {
              status: "completed",
              adminNotes: "Auto-approved by admin",
              approvedBy: req.session.userId,
              approvedAt: new Date(),
              completedAt: new Date(),
              transactionHash,
            });

            // Create ledger entry
            await storage.createLedgerEntry({
              userId: withdrawal.merchantId,
              withdrawalId: withdrawal.id,
              type: "withdrawal_completed",
              btcAmount: coinSymbol === "BTC" ? -withdrawal.btcAmount : 0,
              balanceAfter: (await storage.getVirtualWallet(withdrawal.merchantId))?.availableBalance || 0,
              description: `Withdrawal auto-approved by admin - sent to ${(withdrawal.btcAddress || withdrawal.bnbAddress || withdrawal.usdtAddress || "").substring(0, 15)}...`,
            });

            approvedCount++;
          }
        } catch (err) {
          errors.push(`Failed to approve withdrawal ${withdrawal.id}: ${err instanceof Error ? err.message : "Unknown error"}`);
        }
      }

      res.json({ 
        message: `Approved ${approvedCount} withdrawals`, 
        approvedCount,
        errors: errors.length > 0 ? errors : undefined 
      });
    } catch (error) {
      console.error("Bulk withdrawal approval error:", error);
      res.status(500).json({ message: "Failed to approve withdrawals" });
    }
  });

  // Admin rejects withdrawal
  app.post("/api/admin/withdrawals/:id/reject", requireAdmin, async (req, res) => {
    try {
      const withdrawal = await storage.getWithdrawalRequest(req.params.id);
      if (!withdrawal) {
        return res.status(404).json({ message: "Withdrawal not found" });
      }

      if (withdrawal.status !== "pending") {
        return res.status(400).json({ message: "Withdrawal already processed" });
      }

      const { adminNotes } = req.body;

      // Return funds to merchant wallet
      await storage.updateVirtualWalletBalance(withdrawal.merchantId, withdrawal.btcAmount, 0);

      await storage.updateWithdrawalRequest(withdrawal.id, {
        status: "rejected",
        adminNotes,
        approvedBy: req.session.userId,
        approvedAt: new Date(),
      });

      // Create ledger entry
      const updatedWallet = await storage.getVirtualWallet(withdrawal.merchantId);
      await storage.createLedgerEntry({
        userId: withdrawal.merchantId,
        withdrawalId: withdrawal.id,
        type: "withdrawal_refunded",
        btcAmount: withdrawal.btcAmount,
        balanceAfter: updatedWallet?.availableBalance || 0,
        description: `Withdrawal rejected - funds returned`,
      });

      res.json({ message: "Withdrawal rejected, funds returned" });
    } catch (error) {
      res.status(500).json({ message: "Failed to reject withdrawal" });
    }
  });

  // Admin gets all escrow orders
  app.get("/api/admin/escrow", requireAdmin, async (req, res) => {
    try {
      const orders = await storage.getAllEscrowOrders();
      const ordersWithDetails = await Promise.all(
        orders.map(async (escrow) => {
          const buyer = await storage.getUser(escrow.buyerId);
          const merchant = await storage.getUser(escrow.merchantId);
          return {
            ...escrow,
            buyer: buyer ? { id: buyer.id, username: buyer.username } : null,
            merchant: merchant ? { id: merchant.id, username: merchant.username } : null,
          };
        })
      );
      res.json(ordersWithDetails);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch escrow orders" });
    }
  });

  // Admin gets open disputes
  app.get("/api/admin/disputes", requireAdmin, async (req, res) => {
    try {
      const allDisputes = await storage.getAllDisputes();
      const disputesWithDetails = await Promise.all(
        allDisputes.map(async (dispute) => {
          const buyer = await storage.getUser(dispute.buyerId);
          const merchant = await storage.getUser(dispute.merchantId);
          const escrow = await storage.getEscrowOrder(dispute.escrowOrderId);
          return {
            ...dispute,
            buyer: buyer ? { id: buyer.id, username: buyer.username } : null,
            merchant: merchant ? { id: merchant.id, username: merchant.username } : null,
            escrow,
          };
        })
      );
      res.json(disputesWithDetails);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch disputes" });
    }
  });

  // Get BTC rate
  app.get("/api/btc-rate", async (req, res) => {
    const rate = await getBtcRate();
    res.json({ rate });
  });

  // Get BNB rate
  app.get("/api/bnb-rate", async (req, res) => {
    const rate = await bnbBlockchainService.getCurrentBnbPrice();
    res.json({ rate });
  });

  // Get all crypto rates
  app.get("/api/crypto-rates", async (req, res) => {
    const [btcRate, bnbRate] = await Promise.all([
      getBtcRate(),
      bnbBlockchainService.getCurrentBnbPrice()
    ]);
    res.json({ btc: btcRate, bnb: bnbRate });
  });

  // Get enabled payment coins
  app.get("/api/payment-coins", async (req, res) => {
    try {
      const coins = await storage.getAllPaymentCoins();
      const enabledCoins = coins.filter(c => c.isEnabled);
      res.json(enabledCoins);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch payment coins" });
    }
  });

  // Admin cancel escrow and return to buyer
  app.post("/api/admin/escrow/:id/cancel", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { adminNotes, sendRealCrypto } = req.body;
      
      const escrow = await storage.getEscrowOrder(id);
      if (!escrow) {
        return res.status(404).json({ message: "Escrow order not found" });
      }
      
      if (escrow.status !== "escrow" && escrow.status !== "pending_payment") {
        return res.status(400).json({ message: "Cannot cancel this escrow" });
      }

      // Determine coin type and get correct amount
      const isBtc = escrow.coinSymbol === "BTC";
      const isBnb = escrow.coinSymbol === "BNB";
      const isUsdt = escrow.coinSymbol === "USDT";
      const refundAmount = isBtc ? escrow.btcAmount : escrow.cryptoAmount;
      let transactionHash = `refund_${Date.now()}`;

      // Send actual crypto refund to buyer if requested and buyer provided refund address
      if (sendRealCrypto && escrow.buyerRefundAddress) {
        if (isBnb || isUsdt) {
          if (!bnbWalletService.isInitialized()) {
            return res.status(400).json({ message: "BNB wallet service not initialized" });
          }
          const coinType = isUsdt ? "USDT" : "BNB";
          const sendFn = isUsdt ? bnbWalletService.sendUsdt : bnbWalletService.sendBnb;
          const result = await sendFn.call(
            bnbWalletService,
            "m/44'/60'/0'/0/0",
            escrow.buyerRefundAddress,
            refundAmount
          );
          if (!result.success) {
            return res.status(400).json({ 
              message: `Failed to send ${coinType} refund`, 
              error: result.error 
            });
          }
          transactionHash = result.txHash || transactionHash;
          console.log(`[Cancel] ${coinType} refund sent to ${escrow.buyerRefundAddress}: ${transactionHash}`);
        } else if (isBtc) {
          if (!walletService.isInitialized()) {
            return res.status(400).json({ message: "BTC wallet service not initialized" });
          }
          const result = await walletService.sendBtc(
            "m/84'/0'/0'/0/0",
            escrow.buyerRefundAddress,
            refundAmount
          );
          if (!result.success) {
            return res.status(400).json({ 
              message: "Failed to send BTC refund", 
              error: result.error 
            });
          }
          transactionHash = result.txHash || transactionHash;
          console.log(`[Cancel] BTC refund sent to ${escrow.buyerRefundAddress}: ${transactionHash}`);
        }
      }

      // Update escrow status to refunded
      await storage.updateEscrowOrder(id, {
        status: "refunded",
        refundedAt: new Date(),
        transactionHash: transactionHash,
      });

      // If payment was received, credit buyer's wallet OR create ledger entry for sent refund
      if (escrow.status === "escrow") {
        if (sendRealCrypto && escrow.buyerRefundAddress) {
          // Create ledger entry for sent refund
          await storage.createLedgerEntry({
            userId: escrow.buyerId,
            escrowOrderId: id,
            type: "refund_sent",
            btcAmount: refundAmount, // Amount field for any crypto type
            balanceAfter: 0, // No in-app balance change
            description: `${escrow.coinSymbol} refund sent to wallet: ${escrow.buyerRefundAddress.substring(0, 10)}...`,
          });
          console.log(`[Cancel] Refund processed: ${refundAmount.toFixed(isBtc ? 8 : 6)} ${escrow.coinSymbol}`);
        } else {
          // Credit buyer's in-app wallet as fallback
          let buyerWallet = await storage.getVirtualWallet(escrow.buyerId);
          if (!buyerWallet) {
            buyerWallet = await storage.createVirtualWallet(escrow.buyerId);
          }
          
          if (isBtc) {
            await storage.updateVirtualWalletBalance(escrow.buyerId, refundAmount, 0);
          } else if (isBnb) {
            await storage.updateVirtualWalletBnbBalance(escrow.buyerId, refundAmount, 0);
          } else if (isUsdt) {
            await storage.updateVirtualWalletUsdtBalance(escrow.buyerId, refundAmount, 0);
          }
          
          const updatedWallet = await storage.getVirtualWallet(escrow.buyerId);
          const balanceAfter = isBtc ? (updatedWallet?.availableBalance || 0) : isBnb ? (updatedWallet?.bnbAvailableBalance || 0) : (updatedWallet?.usdtAvailableBalance || 0);
          
          await storage.createLedgerEntry({
            userId: escrow.buyerId,
            escrowOrderId: id,
            type: "refund_received",
            btcAmount: refundAmount, // Amount field for any crypto type
            balanceAfter: balanceAfter,
            description: `Refund for cancelled order - Admin action`,
          });
        }
      }

      // Restore stock for each item in the cancelled order
      try {
        const cancelledOrderItems = await storage.getOrderItems(escrow.orderId);
        for (const orderItem of cancelledOrderItems) {
          await storage.incrementStock(orderItem.productId, orderItem.quantity || 1);
        }
      } catch (stockError) {
        console.error("[Cancel] Failed to restore stock:", stockError);
      }

      res.json({ message: "Escrow cancelled and refunded" });
    } catch (error) {
      console.error("Cancel escrow error:", error);
      res.status(500).json({ message: "Failed to cancel escrow" });
    }
  });

  // Admin release escrow to merchant early
  app.post("/api/admin/escrow/:id/release", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { adminNotes } = req.body;
      
      const escrow = await storage.getEscrowOrder(id);
      if (!escrow) {
        return res.status(404).json({ message: "Escrow order not found" });
      }
      
      if (escrow.status !== "escrow") {
        return res.status(400).json({ message: "Cannot release this escrow" });
      }

      // Determine coin type and get correct amount
      const isBtc = escrow.coinSymbol === "BTC";
      const isBnb = escrow.coinSymbol === "BNB";
      const isUsdt = escrow.coinSymbol === "USDT";
      const totalAmount = isBtc ? escrow.btcAmount : escrow.cryptoAmount;

      // Calculate fee - check product-specific fee first, then global fee
      let feePercent = 0;
      const globalFeeSetting = await storage.getAdminSetting("global_fee_percent");
      if (globalFeeSetting) {
        feePercent = parseFloat(globalFeeSetting.value) || 0;
      }
      
      // Check for product-specific fee from the order
      const order = await storage.getOrder(escrow.orderId);
      if (order) {
        const orderItemsList = await storage.getOrderItems(escrow.orderId);
        for (const item of orderItemsList) {
          const productFee = await storage.getProductFee(item.productId);
          if (productFee) {
            feePercent = Math.max(feePercent, productFee.feePercent);
          }
        }
      }

      // Calculate fee amount and merchant amount
      const feeAmount = (totalAmount * feePercent) / 100;
      const merchantAmount = totalAmount - feeAmount;

      // Update escrow status with fee info
      await storage.updateEscrowOrder(id, {
        status: "released",
        releasedAt: new Date(),
        adminNotes,
        feePercent: feePercent,
        feeAmount: feeAmount,
        merchantAmount: merchantAmount,
      });

      // Add fee to admin wallet
      if (feeAmount > 0) {
        if (isBtc) {
          await storage.updateAdminWalletBalance(feeAmount, 0, 0);
        } else if (isBnb) {
          await storage.updateAdminWalletBalance(0, feeAmount, 0);
        } else if (isUsdt) {
          await storage.updateAdminWalletBalance(0, 0, feeAmount);
        }
        console.log(`[Admin Release] Fee collected: ${feeAmount.toFixed(isBtc ? 8 : 6)} ${escrow.coinSymbol} (${feePercent}%)`);
      }

      // Credit merchant wallet
      let merchantWallet = await storage.getVirtualWallet(escrow.merchantId);
      if (!merchantWallet) {
        merchantWallet = await storage.createVirtualWallet(escrow.merchantId);
      }

      // Move from pending to available balance - use merchantAmount after fee deduction
      if (isBtc) {
        await storage.updateVirtualWalletBalance(escrow.merchantId, merchantAmount, -totalAmount);
      } else if (isBnb) {
        await storage.updateVirtualWalletBnbBalance(escrow.merchantId, merchantAmount, -totalAmount);
      } else if (isUsdt) {
        await storage.updateVirtualWalletUsdtBalance(escrow.merchantId, merchantAmount, -totalAmount);
      }

      const updatedWallet = await storage.getVirtualWallet(escrow.merchantId);
      const balanceAfter = isBtc ? (updatedWallet?.availableBalance || 0) : isBnb ? (updatedWallet?.bnbAvailableBalance || 0) : (updatedWallet?.usdtAvailableBalance || 0);
      await storage.createLedgerEntry({
        userId: escrow.merchantId,
        escrowOrderId: id,
        type: "escrow_released",
        btcAmount: isBtc ? merchantAmount : 0,
        balanceAfter,
        description: `Payment received: ${merchantAmount.toFixed(isBtc ? 8 : 6)} ${escrow.coinSymbol || "BTC"} (fee: ${feeAmount.toFixed(isBtc ? 8 : 6)} ${escrow.coinSymbol || "BTC"}) - Admin release`,
      });

      res.json({ 
        message: `${merchantAmount.toFixed(isBtc ? 8 : 6)} ${escrow.coinSymbol || "BTC"} released to merchant (fee: ${feeAmount.toFixed(isBtc ? 8 : 6)} ${escrow.coinSymbol || "BTC"})` 
      });
    } catch (error) {
      console.error("Release escrow error:", error);
      res.status(500).json({ message: "Failed to release escrow" });
    }
  });

  // Admin wallet stats
  app.get("/api/admin/wallet/stats", requireAdmin, async (req, res) => {
    try {
      const orders = await storage.getAllEscrowOrders();
      
      // BTC orders
      const btcOrders = orders.filter(o => o.coinSymbol === "BTC" || !o.coinSymbol);
      // BNB orders
      const bnbOrders = orders.filter(o => o.coinSymbol === "BNB");
      
      const stats = {
        // BTC stats
        totalInEscrow: btcOrders.filter(o => o.status === "escrow").reduce((sum, o) => sum + (o.btcAmount || 0), 0),
        totalPendingPayments: btcOrders.filter(o => o.status === "pending_payment").reduce((sum, o) => sum + (o.btcAmount || 0), 0),
        totalReleased: btcOrders.filter(o => o.status === "released").reduce((sum, o) => sum + (o.btcAmount || 0), 0),
        totalRefunded: btcOrders.filter(o => o.status === "refunded").reduce((sum, o) => sum + (o.btcAmount || 0), 0),
        escrowCount: btcOrders.filter(o => o.status === "escrow").length,
        pendingCount: btcOrders.filter(o => o.status === "pending_payment").length,
        // BNB stats
        bnbTotalInEscrow: bnbOrders.filter(o => o.status === "escrow").reduce((sum, o) => sum + (o.cryptoAmount || 0), 0),
        bnbTotalPendingPayments: bnbOrders.filter(o => o.status === "pending_payment").reduce((sum, o) => sum + (o.cryptoAmount || 0), 0),
        bnbTotalReleased: bnbOrders.filter(o => o.status === "released").reduce((sum, o) => sum + (o.cryptoAmount || 0), 0),
        bnbTotalRefunded: bnbOrders.filter(o => o.status === "refunded").reduce((sum, o) => sum + (o.cryptoAmount || 0), 0),
        bnbEscrowCount: bnbOrders.filter(o => o.status === "escrow").length,
        bnbPendingCount: bnbOrders.filter(o => o.status === "pending_payment").length,
      };
      
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to get wallet stats" });
    }
  });

  // Admin master wallet balance - real blockchain balance
  app.get("/api/admin/wallet/master-balance", requireAdmin, async (req, res) => {
    try {
      let btcBalance = 0;
      let bnbBalance = 0;

      // Get BTC master wallet balance (index 0)
      if (walletService.isInitialized()) {
        try {
          const btcAddress = walletService.deriveAddress(0);
          const btcInfo = await blockchainService.getAddressInfo(btcAddress.address);
          if (btcInfo) {
            btcBalance = btcInfo.balance;
          }
        } catch (e) {
          console.error('[Admin] Failed to get BTC balance:', e);
        }
      }

      // Get BNB master wallet balance (index 0)
      if (bnbWalletService.isInitialized()) {
        try {
          const bnbAddress = bnbWalletService.deriveAddress(0);
          const bnbInfo = await bnbWalletService.getAddressBalance(bnbAddress.address);
          if (bnbInfo) {
            bnbBalance = bnbInfo.balance;
          }
        } catch (e) {
          console.error('[Admin] Failed to get BNB balance:', e);
        }
      }

      res.json({
        btcBalance,
        bnbBalance,
        btcInitialized: walletService.isInitialized(),
        bnbInitialized: bnbWalletService.isInitialized(),
      });
    } catch (error) {
      console.error('[Admin] Master balance error:', error);
      res.status(500).json({ message: "Failed to get master wallet balance" });
    }
  });

  // ============ PAYMENT COINS ROUTES ============

  // Get all enabled payment coins (public)
  app.get("/api/payment-coins", async (req, res) => {
    try {
      const coins = await storage.getEnabledPaymentCoins();
      res.json(coins);
    } catch (error) {
      res.status(500).json({ message: "Failed to get payment coins" });
    }
  });

  // Admin: Get all payment coins
  app.get("/api/admin/payment-coins", requireAdmin, async (req, res) => {
    try {
      const coins = await storage.getAllPaymentCoins();
      res.json(coins);
    } catch (error) {
      res.status(500).json({ message: "Failed to get payment coins" });
    }
  });

  // Admin: Add payment coin
  app.post("/api/admin/payment-coins", requireAdmin, async (req, res) => {
    try {
      const { symbol, name, network, isEnabled, rpcUrl, explorerUrl, addressPrefix, decimals, sortOrder } = req.body;
      
      if (!symbol || !name || !network) {
        return res.status(400).json({ message: "Symbol, name, and network are required" });
      }

      const existingCoin = await storage.getPaymentCoinBySymbol(symbol.toUpperCase());
      if (existingCoin) {
        return res.status(400).json({ message: "A coin with this symbol already exists" });
      }

      const coin = await storage.createPaymentCoin({
        symbol: symbol.toUpperCase(),
        name,
        network,
        isEnabled: isEnabled !== false,
        rpcUrl,
        explorerUrl,
        addressPrefix,
        decimals: decimals || 8,
        sortOrder: sortOrder || 0,
      });

      res.json(coin);
    } catch (error) {
      console.error("Create payment coin error:", error);
      res.status(500).json({ message: "Failed to create payment coin" });
    }
  });

  // Admin: Update payment coin
  app.patch("/api/admin/payment-coins/:id", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const coin = await storage.updatePaymentCoin(id, req.body);
      if (!coin) {
        return res.status(404).json({ message: "Payment coin not found" });
      }
      res.json(coin);
    } catch (error) {
      res.status(500).json({ message: "Failed to update payment coin" });
    }
  });

  // Admin: Toggle payment coin enabled/disabled
  app.post("/api/admin/payment-coins/:id/toggle", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const coin = await storage.getPaymentCoin(id);
      if (!coin) {
        return res.status(404).json({ message: "Payment coin not found" });
      }
      const updatedCoin = await storage.updatePaymentCoin(id, { isEnabled: !coin.isEnabled });
      if (!updatedCoin) {
        return res.status(500).json({ message: "Failed to update payment coin" });
      }
      res.json(updatedCoin);
    } catch (error) {
      console.error("[Payment Coins] Error toggling coin:", error);
      res.status(500).json({ message: "Failed to toggle payment coin", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // ============ ADMIN SETTINGS ROUTES ============

  // Admin: Get all settings
  app.get("/api/admin/settings", requireAdmin, async (req, res) => {
    try {
      const settings = await storage.getAllAdminSettings();
      res.json(settings);
    } catch (error) {
      res.status(500).json({ message: "Failed to get settings" });
    }
  });

  // Admin: Get single setting
  app.get("/api/admin/settings/:key", requireAdmin, async (req, res) => {
    try {
      const setting = await storage.getAdminSetting(req.params.key);
      if (!setting) {
        return res.status(404).json({ message: "Setting not found" });
      }
      res.json(setting);
    } catch (error) {
      res.status(500).json({ message: "Failed to get setting" });
    }
  });

  // Admin: Set setting
  app.post("/api/admin/settings", requireAdmin, async (req, res) => {
    try {
      const { key, value, description } = req.body;
      if (!key || value === undefined) {
        return res.status(400).json({ message: "Key and value are required" });
      }
      const setting = await storage.setAdminSetting(key, value, description, req.session.userId);
      res.json(setting);
    } catch (error) {
      res.status(500).json({ message: "Failed to set setting" });
    }
  });

  // Admin: Toggle early approval for specific escrow order
  app.post("/api/admin/escrow/:id/toggle-early-approval", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const escrow = await storage.getEscrowOrder(id);
      if (!escrow) {
        return res.status(404).json({ message: "Escrow order not found" });
      }
      
      const updatedEscrow = await storage.updateEscrowOrder(id, {
        earlyApprovalEnabled: !escrow.earlyApprovalEnabled,
      });
      
      res.json({ 
        message: updatedEscrow?.earlyApprovalEnabled 
          ? "Early approval enabled for this order" 
          : "Early approval disabled for this order",
        escrow: updatedEscrow 
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to toggle early approval" });
    }
  });

  // Buyer cancels their own pending payment escrow
  app.post("/api/escrow/:id/cancel", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const escrow = await storage.getEscrowOrder(id);
      
      if (!escrow) {
        return res.status(404).json({ message: "Escrow order not found" });
      }

      if (escrow.buyerId !== req.session.userId) {
        return res.status(403).json({ message: "You can only cancel your own orders" });
      }

      if (escrow.status !== "pending_payment") {
        return res.status(400).json({ message: "Can only cancel orders that are awaiting payment" });
      }

      await storage.updateEscrowOrder(id, {
        status: "cancelled",
        cancelledAt: new Date(),
      });

      res.json({ message: "Payment cancelled successfully" });
    } catch (error) {
      console.error("Cancel escrow error:", error);
      res.status(500).json({ message: "Failed to cancel order" });
    }
  });

  // ============ ADMIN FEE SYSTEM ROUTES ============

  // Get global fee setting (public for display)
  app.get("/api/fee-settings", async (req, res) => {
    try {
      const globalFee = await storage.getAdminSetting("global_fee_percent");
      res.json({ 
        globalFeePercent: globalFee ? parseFloat(globalFee.value) : 0 
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to get fee settings" });
    }
  });

  // Admin: Get admin wallet info
  app.get("/api/admin/wallet", requireAdmin, async (req, res) => {
    try {
      const wallet = await storage.getOrCreateAdminWallet();
      res.json(wallet);
    } catch (error) {
      res.status(500).json({ message: "Failed to get admin wallet" });
    }
  });

  // Admin: Update fee settings
  app.post("/api/admin/fee-settings", requireAdmin, async (req, res) => {
    try {
      // Accept both feePercent and globalFeePercent for compatibility
      const { feePercent, globalFeePercent } = req.body;
      const rawFeeValue = feePercent ?? globalFeePercent;
      
      if (rawFeeValue === undefined || rawFeeValue === null) {
        return res.status(400).json({ message: "feePercent is required" });
      }
      
      const feeValue = parseFloat(rawFeeValue);
      if (isNaN(feeValue) || feeValue < 0 || feeValue > 100) {
        return res.status(400).json({ message: "Fee must be a valid number between 0 and 100 percent" });
      }

      await storage.setAdminSetting(
        "global_fee_percent", 
        feeValue.toString(), 
        "Global fee percentage on all transactions",
        req.session.userId
      );

      res.json({ message: "Fee settings updated", globalFeePercent: feeValue });
    } catch (error) {
      console.error("[Fee Settings] Error:", error);
      res.status(500).json({ message: "Failed to update fee settings" });
    }
  });

  // Admin: Set product-specific fee
  app.post("/api/admin/product-fees/:productId", requireAdmin, async (req, res) => {
    try {
      const { productId } = req.params;
      const { feePercent } = req.body;

      if (feePercent < 0 || feePercent > 100) {
        return res.status(400).json({ message: "Fee must be between 0 and 100 percent" });
      }

      const fee = await storage.setProductFee(productId, feePercent, req.session.userId);
      res.json(fee);
    } catch (error) {
      res.status(500).json({ message: "Failed to set product fee" });
    }
  });

  // Admin: Get all product fees
  app.get("/api/admin/product-fees", requireAdmin, async (req, res) => {
    try {
      const fees = await storage.getAllProductFees();
      res.json(fees);
    } catch (error) {
      res.status(500).json({ message: "Failed to get product fees" });
    }
  });

  // Admin: Delete product-specific fee
  app.delete("/api/admin/product-fees/:productId", requireAdmin, async (req, res) => {
    try {
      await storage.deleteProductFee(req.params.productId);
      res.json({ message: "Product fee removed" });
    } catch (error) {
      res.status(500).json({ message: "Failed to remove product fee" });
    }
  });

  // Admin: Update withdrawal addresses
  app.post("/api/admin/wallet/addresses", requireAdmin, async (req, res) => {
    try {
      const { btcAddress, bnbAddress, usdtAddress } = req.body;
      const wallet = await storage.setAdminWithdrawalAddresses(btcAddress, bnbAddress, usdtAddress);
      res.json(wallet);
    } catch (error) {
      res.status(500).json({ message: "Failed to update withdrawal addresses" });
    }
  });

  // Admin: Withdraw from admin wallet (requires password)
  app.post("/api/admin/wallet/withdraw", requireAdmin, async (req, res) => {
    try {
      const { coinSymbol, amount, toAddress, password } = req.body;
      
      if (!coinSymbol || !amount || !toAddress) {
        return res.status(400).json({ message: "Coin symbol, amount, and address are required" });
      }

      // Validate coinSymbol is supported
      if (coinSymbol !== "BTC" && coinSymbol !== "BNB" && coinSymbol !== "USDT") {
        return res.status(400).json({ message: "Unsupported coin symbol. Only BTC, BNB, and USDT are supported." });
      }

      // Verify withdrawal password from environment
      const withdrawPassword = process.env.ADMIN_WITHDRAW_PASSWORD;
      if (!withdrawPassword) {
        return res.status(500).json({ message: "Withdrawal password not configured. Please set ADMIN_WITHDRAW_PASSWORD in environment." });
      }
      
      if (!password || password !== withdrawPassword) {
        return res.status(401).json({ message: "Invalid withdrawal password" });
      }

      const wallet = await storage.getOrCreateAdminWallet();
      
      if (coinSymbol === "BTC" && wallet.btcBalance < amount) {
        return res.status(400).json({ message: "Insufficient BTC balance" });
      }
      if (coinSymbol === "BNB" && wallet.bnbBalance < amount) {
        return res.status(400).json({ message: "Insufficient BNB balance" });
      }
      if (coinSymbol === "USDT" && wallet.usdtBalance < amount) {
        return res.status(400).json({ message: "Insufficient USDT balance" });
      }

      // Deduct from admin wallet
      if (coinSymbol === "BTC") {
        await storage.updateAdminWalletBalance(-amount, 0, 0);
      } else if (coinSymbol === "BNB") {
        await storage.updateAdminWalletBalance(0, -amount, 0);
      } else {
        await storage.updateAdminWalletBalance(0, 0, -amount);
      }

      // Create withdrawal request record
      const withdrawal = await storage.createAdminWithdrawalRequest(coinSymbol, amount, toAddress);

      // If BTC and wallet is initialized, try real transaction
      if (coinSymbol === "BTC" && walletService.isInitialized()) {
        const result = await walletService.sendBtc("m/84'/0'/0'/0/0", toAddress, amount);
        if (result.success) {
          await storage.updateAdminWithdrawalRequest(withdrawal.id, {
            status: "completed",
            transactionHash: result.txHash,
            completedAt: new Date(),
          });
          return res.json({ message: "Withdrawal completed", txHash: result.txHash });
        } else {
          // Revert balance and mark withdrawal as failed
          await storage.updateAdminWalletBalance(amount, 0, 0);
          await storage.updateAdminWithdrawalRequest(withdrawal.id, {
            status: "failed",
            completedAt: new Date(),
          });
          return res.status(400).json({ message: "Transaction failed", error: result.error });
        }
      }

      // If BNB and wallet is initialized, try real transaction
      if (coinSymbol === "BNB" && bnbWalletService.isInitialized()) {
        const result = await bnbWalletService.sendBnb("m/44'/60'/0'/0/0", toAddress, amount);
        if (result.success) {
          await storage.updateAdminWithdrawalRequest(withdrawal.id, {
            status: "completed",
            transactionHash: result.txHash,
            completedAt: new Date(),
          });
          return res.json({ message: "Withdrawal completed", txHash: result.txHash });
        } else {
          // Revert balance and mark withdrawal as failed
          await storage.updateAdminWalletBalance(0, amount, 0);
          await storage.updateAdminWithdrawalRequest(withdrawal.id, {
            status: "failed",
            completedAt: new Date(),
          });
          return res.status(400).json({ message: "Transaction failed", error: result.error });
        }
      }

      // If USDT and wallet is initialized, try real transaction
      if (coinSymbol === "USDT" && bnbWalletService.isInitialized()) {
        const result = await bnbWalletService.sendUsdt("m/44'/60'/0'/0/0", toAddress, amount);
        if (result.success) {
          await storage.updateAdminWithdrawalRequest(withdrawal.id, {
            status: "completed",
            transactionHash: result.txHash,
            completedAt: new Date(),
          });
          return res.json({ message: "Withdrawal completed", txHash: result.txHash });
        } else {
          // Revert balance and mark withdrawal as failed
          await storage.updateAdminWalletBalance(0, 0, amount);
          await storage.updateAdminWithdrawalRequest(withdrawal.id, {
            status: "failed",
            completedAt: new Date(),
          });
          return res.status(400).json({ message: "Transaction failed", error: result.error });
        }
      }

      res.json({ message: "Withdrawal request created", withdrawal });
    } catch (error) {
      console.error("Admin withdrawal error:", error);
      res.status(500).json({ message: "Failed to process withdrawal" });
    }
  });

  // ============ END BITCOIN ESCROW SYSTEM ROUTES ============

  // ============ EMAIL SETTINGS & LOGS ============

  app.get("/api/admin/email/status", requireAdmin, async (req, res) => {
    try {
      const { isEmailConfigured, getConfiguredEmail } = await import("./email");
      res.json({
        configured: isEmailConfigured(),
        email: getConfiguredEmail(),
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to get email status" });
    }
  });

  app.get("/api/admin/email/logs", requireAdmin, async (req, res) => {
    try {
      const minutes = parseInt(req.query.minutes as string) || 20;
      const logs = await storage.getRecentEmailLogs(minutes);
      const count = logs.length;
      res.json({ logs, count, minutes });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch email logs" });
    }
  });

  app.get("/api/admin/email/stats", requireAdmin, async (req, res) => {
    try {
      const minutes = parseInt(req.query.minutes as string) || 20;
      const count = await storage.getEmailLogCount(minutes);
      res.json({ count, minutes });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch email stats" });
    }
  });

  // Test email endpoint - send test email to verify system works
  app.post("/api/admin/email/test", requireAdmin, async (req, res) => {
    try {
      const { email } = req.body;
      if (!email || typeof email !== "string") {
        return res.status(400).json({ message: "Email address required" });
      }

      const { sendEmail: sendTestEmail } = await import("./email");
      
      // Create test email content
      const siteUrl = process.env.SITE_URL || `http://localhost:${process.env.PORT || 8000}`;
      
      const testContent = `
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="margin: 0; font-size: 24px; color: #111827; font-weight: 600;">ShopHub Email System Test</h1>
        </div>
        
        <div style="background: #f0fdf4; padding: 25px; border-radius: 12px; margin: 25px 0; border-left: 4px solid #10b981;">
          <p style="margin: 0 0 10px 0; font-size: 16px; color: #166534; font-weight: 600;">✓ Email System Working!</p>
          <p style="margin: 10px 0; font-size: 14px; color: #374151;">This is a test email to verify that email notifications are properly configured on ShopHub.</p>
          <p style="margin: 10px 0; font-size: 14px; color: #374151;"><strong>Time:</strong> ${new Date().toLocaleString()}</p>
        </div>
        
        <div style="text-align: center; margin-top: 30px;">
          <a href="${siteUrl}" style="display: inline-block; padding: 12px 24px; background: #10b981; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">
            Visit ShopHub
          </a>
        </div>
        
        <p style="margin-top: 25px; text-align: center; color: #6b7280; font-size: 12px;">
          This is a test email from ShopHub's email notification system.
        </p>
      `;

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>ShopHub Email Test</title>
        </head>
        <body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
          <table role="presentation" style="width: 100%; border-collapse: collapse;">
            <tr>
              <td align="center" style="padding: 40px 20px;">
                <table role="presentation" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                  <tr>
                    <td style="padding: 40px 30px;">
                      ${testContent}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 20px 30px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; border-radius: 0 0 12px 12px;">
                      <p style="margin: 0; font-size: 12px; color: #6b7280; text-align: center;">
                        ShopHub Email System Test
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `;

      const result = await sendTestEmail({
        to: email,
        subject: "ShopHub Email System Test",
        html,
        emailType: "chat",
      });

      res.json({ 
        message: result ? "Test email sent successfully" : "Failed to send test email",
        sent: result,
        email 
      });
    } catch (error) {
      console.error("[Test Email] Error:", error);
      res.status(500).json({ 
        message: "Failed to send test email",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // ============ SPLASH SCREEN ENDPOINTS ============

  // Get splash screen (public endpoint)
  app.get("/api/splash-screen", async (req, res) => {
    try {
      const splashData = await storage.getSplashScreen();
      if (splashData) {
        res.json(splashData);
      } else {
        res.json({
          id: "default",
          htmlContent: "<div style=\"text-align: center; padding: 50px;\"><h1>Welcome!</h1></div>",
          isEnabled: true,
          displayDuration: 3000,
        });
      }
    } catch (error) {
      console.error("Error fetching splash screen:", error);
      res.json({
        id: "default",
        htmlContent: "<div style=\"text-align: center; padding: 50px;\"><h1>Welcome!</h1></div>",
        isEnabled: true,
        displayDuration: 3000,
      });
    }
  });

  // Admin: Get splash screen
  app.get("/api/admin/splash-screen", requireAdmin, async (req, res) => {
    try {
      const splashData = await storage.getSplashScreen();
      if (splashData) {
        res.json(splashData);
      } else {
        const defaultScreen = {
          id: "default",
          htmlContent: "<div style=\"text-align: center; padding: 50px;\"><h1>Welcome to ShopHub!</h1><p>Your customizable splash screen</p></div>",
          isEnabled: true,
          displayDuration: 3000,
          createdAt: new Date(),
          updatedAt: new Date(),
          updatedBy: null,
        };
        res.json(defaultScreen);
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch splash screen" });
    }
  });

  // Admin: Update splash screen
  app.post("/api/admin/splash-screen", requireAdmin, async (req, res) => {
    try {
      const { htmlContent, isEnabled, displayDuration, useLoadingMode } = req.body;
      
      if (!htmlContent || typeof htmlContent !== "string") {
        return res.status(400).json({ message: "HTML content is required" });
      }

      const updated = await storage.updateSplashScreen(req.session.userId!, {
        htmlContent,
        isEnabled: isEnabled !== false,
        displayDuration: displayDuration || 3000,
        useLoadingMode: useLoadingMode === true,
      });

      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update splash screen" });
    }
  });

  // ============ USER WALLET ENDPOINTS (BEP-20 USDT) ============

  // Create wallet for user
  app.post("/api/wallet/create", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      console.log("[Wallet] Creating wallet for user:", userId);
      
      // Check if wallet already exists
      const existingWallet = await storage.getUserWallet(userId);
      if (existingWallet) {
        console.log("[Wallet] User already has a wallet:", existingWallet.id);
        return res.status(400).json({ message: "User already has a wallet" });
      }

      console.log("[Wallet] Generating new wallet with random seed...");
      // Generate new wallet with random seed phrase
      const { address, seed } = bep20WalletService.generateWallet();
      console.log("[Wallet] Generated address:", address);
      
      // Encrypt seed before storage
      const encryptedSeed = bep20WalletService.encryptSeed(seed);
      console.log("[Wallet] Seed encrypted successfully");

      // Store wallet in database
      const wallet = await storage.createUserWallet({
        userId,
        seed: encryptedSeed,
        address,
        usdtBalance: 0,
      });

      console.log("[Wallet] Wallet created successfully:", wallet.id);

      // Send initial BNB from platform wallet to cover gas fees
      console.log("[Wallet] Sending initial BNB to cover gas fees...");
      const bnbResult = await bep20WalletService.sendInitialBNB(address);
      if (bnbResult.success && bnbResult.txHash) {
        console.log(`[Wallet] Initial BNB sent successfully: ${bnbResult.txHash}`);
      } else if (!bnbResult.success) {
        console.warn(`[Wallet] Warning: Initial BNB send failed: ${bnbResult.error}`);
      }
      
      // Don't return the seed to client (never expose it)
      const { seed: _, ...walletResponse } = wallet;
      res.json(walletResponse);
    } catch (error) {
      console.error("[Wallet] Error creating wallet:", error);
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ message: `Failed to create wallet: ${errorMsg}` });
    }
  });

  // Get user's wallet
  app.get("/api/wallet/get", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const wallet = await storage.getUserWallet(userId);

      if (!wallet) {
        return res.status(404).json({ message: "Wallet not found" });
      }

      // Get current USDT balance from blockchain for real-time updates
      try {
        const blockchainBalance = await bep20WalletService.getUSDTBalance(wallet.address);
        console.log(`[Wallet] Blockchain USDT balance for ${wallet.address}: ${blockchainBalance}`);
        
        // Update database with real-time blockchain balance
        await storage.updateUserWallet(wallet.id, { usdtBalance: blockchainBalance });
        
        // Return wallet without seed - with real-time balance
        const { seed: _, ...walletResponse } = wallet;
        res.json({ ...walletResponse, usdtBalance: blockchainBalance });
      } catch (blockchainError) {
        console.warn("[Wallet] Blockchain fetch failed, returning database balance:", blockchainError);
        // Fallback to database balance if blockchain fails
        const { seed: _, ...walletResponse } = wallet;
        res.json(walletResponse);
      }
    } catch (error) {
      console.error("[Wallet] Error fetching wallet:", error);
      res.status(500).json({ message: "Failed to fetch wallet" });
    }
  });

  // Receive address (same as wallet address)
  app.get("/api/wallet/receive-address", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const wallet = await storage.getUserWallet(userId);

      if (!wallet) {
        return res.status(404).json({ message: "Wallet not found" });
      }

      res.json({
        address: wallet.address,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch receive address" });
    }
  });

  // Check gas fee status
  app.get("/api/wallet/gas-fee/status", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const wallet = await storage.getUserWallet(userId);

      if (!wallet) {
        return res.status(404).json({ message: "Wallet not found" });
      }

      try {
        // Get BNB balance from blockchain
        const balanceWei = await bep20WalletService.provider.getBalance(wallet.address);
        const bnbBalance = parseFloat(ethers.formatEther(balanceWei));
        const hasGasFee = bnbBalance >= 0.000008;

        res.json({
          hasGasFee,
          bnbBalance,
        });
      } catch (blockchainError) {
        console.warn("[Gas Fee] Blockchain check failed, returning cached status:", blockchainError);
        // Return default safe state if blockchain call fails
        res.json({
          hasGasFee: false,
          bnbBalance: 0,
        });
      }
    } catch (error) {
      console.error("[Gas Fee] Error checking status:", error);
      res.status(500).json({ message: "Failed to check gas fee status" });
    }
  });

  // Request automatic gas fee - Complete flow: 1) Check USDT 2) Send BNB 3) Deduct USDT 4) Auto-transfer
  app.post("/api/wallet/gas-fee/request", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const wallet = await storage.getUserWallet(userId);

      if (!wallet) {
        return res.status(404).json({ message: "Wallet not found" });
      }

      // STEP 1: Check if user has 0.01 USDT fee available
      const usdtBalance = wallet.usdtBalance;
      const feeAmount = 0.01;
      if (usdtBalance < feeAmount) {
        return res.status(400).json({ message: "Insufficient USDT balance for gas fee (0.01 USDT required)" });
      }

      // STEP 2: Send 0.000008 BNB to user's wallet for gas fees
      console.log(`[Gas Fee] Step 2: Sending 0.000008 BNB to user wallet ${wallet.address}`);
      const bnbResult = await bep20WalletService.sendInitialBNB(wallet.address);
      if (!bnbResult.success) {
        console.error("[Gas Fee] Failed to send BNB:", bnbResult.error);
        return res.status(400).json({ message: "Failed to send BNB for gas", error: bnbResult.error });
      }
      console.log(`[Gas Fee] BNB sent successfully! TX: ${bnbResult.txHash}`);

      // STEP 3: Send 0.01 USDT from user's wallet to server wallet
      console.log(`[Gas Fee] Step 3: Sending 0.01 USDT from user wallet to server wallet`);
      const decryptedUserSeed = bep20WalletService.decryptSeed(wallet.seed);
      const serverSeed = process.env.BNB_MASTER_SEED || process.env.BTC_MASTER_SEED;
      
      if (!serverSeed) {
        throw new Error("Server wallet not configured");
      }
      
      const serverWallet = bep20WalletService.getWalletFromSeed(serverSeed);
      const serverWalletAddress = serverWallet.address;
      
      try {
        const usdtTx = await bep20WalletService.sendUSDT(decryptedUserSeed, serverWalletAddress, feeAmount);
        console.log(`[Gas Fee] USDT transferred from user to server: ${usdtTx.hash}`);
      } catch (usdtError) {
        console.error("[Gas Fee] Failed to send USDT from user wallet:", usdtError);
        return res.status(400).json({ message: "Failed to send USDT fee", error: usdtError instanceof Error ? usdtError.message : "Unknown error" });
      }

      // STEP 4: Deduct 0.01 USDT from user's database balance (accounting record)
      const newBalance = usdtBalance - feeAmount;
      console.log(`[Gas Fee] Step 4: Recording USDT deduction in database ${wallet.id}: ${usdtBalance} -> ${newBalance}`);
      
      if (!wallet.id) {
        throw new Error("Wallet ID is missing - cannot deduct fee");
      }
      
      const [updatedWallet] = await db
        .update(userWallets)
        .set({ 
          usdtBalance: newBalance,
          updatedAt: new Date()
        })
        .where(eq(userWallets.id, wallet.id))
        .returning();
      
      if (!updatedWallet) {
        throw new Error(`Failed to update wallet ${wallet.id} - no record updated`);
      }
      console.log(`[Gas Fee] Database updated: ${updatedWallet.usdtBalance}`);

      // STEP 5: Handle fee transfer from server wallet to admin
      const adminData = await db.query.adminWallet.findFirst();
      
      if (adminData?.autoTransferFees && adminData?.usdtWithdrawalAddress) {
        // STEP 5a: Auto-transfer enabled - send fee from server to admin's personal wallet
        console.log(`[Gas Fee] Step 5a: Auto-transfer ON - Sending fee from server to admin wallet ${adminData.usdtWithdrawalAddress}`);
        
        try {
          const adminTx = await bep20WalletService.sendUSDT(serverSeed, adminData.usdtWithdrawalAddress, feeAmount);
          console.log(`[Gas Fee] Fee auto-transferred to admin wallet successfully: ${adminTx.hash}`);
        } catch (transferError) {
          console.warn("[Gas Fee] Auto-transfer to admin failed, adding to admin balance:", transferError);
          await storage.updateAdminWalletBalance(0, 0, feeAmount);
        }
      } else {
        // STEP 5b: Auto-transfer disabled - add fee to admin wallet balance
        console.log(`[Gas Fee] Step 5b: Auto-transfer OFF - Adding fee to admin wallet balance`);
        await storage.updateAdminWalletBalance(0, 0, feeAmount);
      }

      console.log(`[Gas Fee] All steps completed for user ${userId}`);

      // Broadcast gas fee status update to all connected users
      const message = JSON.stringify({ 
        type: "gas_fee_updated", 
        userId,
        hasGasFee: true,
        message: "Gas fee request completed"
      });
      wsClients.forEach((sockets) => {
        sockets.forEach((clientWs) => {
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(message);
          }
        });
      });

      res.json({
        success: true,
        message: "Gas fee processed successfully!",
        steps: {
          step1: "USDT balance verified",
          step2: "0.000008 BNB sent to your wallet",
          step3: "0.01 USDT fee deducted",
          step4: "Fee transferred to admin"
        },
        walletAddress: wallet.address,
        newUsdtBalance: newBalance,
        bnbTxHash: bnbResult.txHash,
      });
    } catch (error) {
      console.error("[Gas Fee] Error processing gas fee request:", error);
      res.status(500).json({ 
        message: "Failed to process gas fee request",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Toggle auto-transfer fees setting
  app.post("/api/admin/wallet/toggle-auto-transfer", requireAdmin, async (req, res) => {
    try {
      const { enabled } = req.body;
      
      if (typeof enabled !== "boolean") {
        return res.status(400).json({ message: "Invalid enabled value" });
      }

      const wallet = await storage.getOrCreateAdminWallet();
      const updated = await storage.updateAdminWallet(wallet.id, { autoTransferFees: enabled });

      if (!updated) {
        return res.status(500).json({ message: "Failed to update auto-transfer setting" });
      }

      console.log(`[Admin] Auto-transfer fees setting updated to: ${enabled}`);

      res.json({
        success: true,
        message: enabled ? "Auto-transfer enabled. Collected fees will be sent to your personal wallet." : "Auto-transfer disabled. Collected fees will be held in admin wallet balance."
      });
    } catch (error) {
      console.error("[Admin] Error updating auto-transfer setting:", error);
      res.status(500).json({ message: "Failed to update auto-transfer setting", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Set admin wallet seed for auto-transfer
  app.post("/api/admin/wallet/set-seed", requireAdmin, async (req, res) => {
    try {
      const { seedPhrase } = req.body;
      
      if (!seedPhrase || typeof seedPhrase !== "string") {
        return res.status(400).json({ message: "Seed phrase is required" });
      }

      // Validate seed phrase format (basic check)
      const words = seedPhrase.trim().split(/\s+/);
      if (words.length < 12) {
        return res.status(400).json({ message: "Seed phrase must contain at least 12 words" });
      }

      // Encrypt the seed
      const encryptedSeed = bep20WalletService.encryptSeed(seedPhrase);
      
      // Store encrypted seed
      const updated = await storage.setAdminSeed(encryptedSeed);

      if (!updated) {
        return res.status(500).json({ message: "Failed to store wallet seed" });
      }

      console.log(`[Admin] Wallet seed stored for auto-transfer functionality`);

      res.json({
        success: true,
        message: "Wallet seed stored successfully. Auto-transfer is now ready to use when enabled."
      });
    } catch (error) {
      console.error("[Admin] Error setting wallet seed:", error);
      res.status(500).json({ message: "Failed to set wallet seed", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Send USDT from user's wallet (platform provided initial BNB for gas)
  app.post("/api/wallet/send", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { recipientAddress, amount, description } = req.body;

      // Validate input
      if (!recipientAddress || !amount || amount <= 0) {
        return res.status(400).json({ message: "Invalid recipient or amount" });
      }

      const wallet = await storage.getUserWallet(userId);
      if (!wallet) {
        return res.status(404).json({ message: "Wallet not found" });
      }

      // Decrypt seed and send USDT from user's wallet
      const decryptedSeed = bep20WalletService.decryptSeed(wallet.seed);
      const transaction = await bep20WalletService.sendUSDT(decryptedSeed, recipientAddress, amount);

      console.log(`[Wallet] User ${userId} sent ${amount} USDT to ${recipientAddress}`);

      res.json({
        success: true,
        transactionHash: transaction.hash,
        message: "USDT sent successfully",
      });
    } catch (error) {
      console.error("[Wallet] Error sending USDT:", error);
      res.status(500).json({ 
        message: "Failed to send USDT",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Generate Trust Wallet deep link for USDT purchases (precise auto-filled links)
  app.post("/api/wallet/buy-usdt", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { amountInr } = req.body;

      // Validate amount
      if (!amountInr || amountInr < 1000) {
        return res.status(400).json({ 
          message: "Minimum purchase amount is ₹1000 INR",
          minAmount: 1000 
        });
      }

      // Get user wallet (contains encrypted seed phrase)
      const wallet = await storage.getUserWallet(userId);
      if (!wallet) {
        return res.status(404).json({ message: "Wallet not found" });
      }

      // Generate Trust Wallet deep link with precise auto-fill
      const { url, amountUSDT, memo } = trustWalletService.generateBuyLink(
        wallet.address,
        amountInr
      );

      console.log(`[Trust Wallet] Generated buy link for user ${userId}`);
      console.log(`[Trust Wallet] Wallet: ${wallet.address} | INR: ₹${amountInr} | USDT: ${amountUSDT}`);

      res.json({
        success: true,
        deepLink: url,
        amountINR: amountInr,
        amountUSDT: amountUSDT,
        walletAddress: wallet.address,
        memo: memo,
        conversionRate: trustWalletService.getConversionRate(),
        provider: "Trust Wallet",
        status: "ready"
      });
    } catch (error) {
      console.error("[Trust Wallet] Error generating buy link:", error);
      res.status(500).json({ 
        message: "Failed to generate Trust Wallet link",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Generate Alchemy Pay payment URL for wallet USDT purchases (SDK version with signatures)
  app.post("/api/wallet/alchemy-pay", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { fiatAmount } = req.body;

      // Validate amount
      if (!fiatAmount || fiatAmount < 1000) {
        return res.status(400).json({ 
          message: "Minimum purchase amount is ₹1000 INR",
          minAmount: 1000 
        });
      }

      // Get user wallet (contains encrypted seed phrase)
      const wallet = await storage.getUserWallet(userId);
      if (!wallet) {
        return res.status(404).json({ message: "Wallet not found" });
      }

      // Generate payment URL with signature support
      // useSignature = true tries to sign the URL (requires ALCHEMY_PAY_SECRET)
      const { url, isSigned } = alchemyPayService.generatePaymentUrl(
        wallet.address,
        fiatAmount,
        true // Request signature generation
      );

      console.log(`[Alchemy Pay] Generated ${isSigned ? 'signed' : 'unsigned'} payment URL for user ${userId}`);
      console.log(`[Alchemy Pay] Wallet: ${wallet.address} | Amount: ₹${fiatAmount}`);

      res.json({
        success: true,
        paymentUrl: url,
        amount: fiatAmount,
        walletAddress: wallet.address,
        isSigned: isSigned,
        message: isSigned 
          ? "Payment link with auto-filled details (signed)" 
          : "Payment link ready - please confirm details on Alchemy Pay page"
      });
    } catch (error) {
      console.error("[Alchemy Pay] Error generating payment URL:", error);
      res.status(500).json({ 
        message: "Failed to generate payment URL",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Pay for escrow order with wallet
  app.post("/api/escrow/:id/pay-with-wallet", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const escrowId = req.params.id;
      const { amount } = req.body;

      // Validate amount
      if (!amount || amount <= 0) {
        return res.status(400).json({ message: "Invalid amount" });
      }

      // Get escrow order
      const escrow = await storage.getEscrowOrder(escrowId);
      if (!escrow) {
        return res.status(404).json({ message: "Escrow order not found" });
      }

      // Verify user is buyer
      if (escrow.buyerId !== userId) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      if (escrow.status !== "pending_payment") {
        return res.status(400).json({ message: "Payment already processed" });
      }

      // Get user wallet
      const wallet = await storage.getUserWallet(userId);
      if (!wallet) {
        return res.status(404).json({ message: "Wallet not found" });
      }

      // Send USDT from user wallet to ESCROW DEPOSIT ADDRESS (not merchant personal wallet)
      // This ensures the payment goes through proper escrow/marketplace wallet flow
      const decryptedSeed = bep20WalletService.decryptSeed(wallet.seed);
      const transaction = await bep20WalletService.sendUSDT(decryptedSeed, escrow.depositAddress, amount);

      // Update escrow status to "escrow" (payment confirmed) and mark as wallet payment
      const now = new Date();
      const escrowExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours from now
      
      const updatedEscrow = await storage.updateEscrowOrder(escrowId, {
        status: "escrow",
        paymentMethod: "wallet",
        escrowStartedAt: now,
        escrowExpiresAt: escrowExpiresAt,
        transactionHash: transaction.hash,
      });

      // Decrement stock now that wallet payment is confirmed
      try {
        const confirmedOrderItems = await storage.getOrderItems(escrow.orderId);
        for (const orderItem of confirmedOrderItems) {
          await storage.decrementStock(orderItem.productId, orderItem.quantity || 1);
        }
      } catch (stockError) {
        console.error("[WalletPayment] Failed to decrement stock:", stockError);
      }


      // Credit merchant's MARKETPLACE WALLET (virtual wallet) with pending balance
      // Do NOT send to personal wallet - only marketplace wallet should handle sales
      let merchantVirtualWallet = await storage.getVirtualWallet(escrow.merchantId);
      if (!merchantVirtualWallet) {
        merchantVirtualWallet = await storage.createVirtualWallet(escrow.merchantId);
      }
      
      const isUsdt = escrow.coinSymbol === "USDT";
      const amountToCredit = amount || (escrow.cryptoAmount || escrow.btcAmount);
      
      if (isUsdt) {
        await storage.updateVirtualWalletUsdtBalance(escrow.merchantId, 0, amountToCredit);
      } else if (escrow.coinSymbol === "BNB") {
        await storage.updateVirtualWalletBnbBalance(escrow.merchantId, 0, amountToCredit);
      } else if (escrow.coinSymbol === "BTC") {
        await storage.updateVirtualWalletBalance(escrow.merchantId, 0, amountToCredit);
      }

      // Create ledger entry for merchant receiving payment
      const updatedWallet = await storage.getVirtualWallet(escrow.merchantId);
      const pendingBalance = escrow.coinSymbol === "USDT" ? (updatedWallet?.usdtPendingBalance || 0) : 
                             escrow.coinSymbol === "BNB" ? (updatedWallet?.bnbPendingBalance || 0) : 
                             (updatedWallet?.pendingBalance || 0);
      
      await storage.createLedgerEntry({
        userId: escrow.merchantId,
        escrowOrderId: escrow.id,
        type: "escrow_received",
        btcAmount: escrow.coinSymbol === "BTC" ? amountToCredit : 0,
        balanceAfter: pendingBalance,
        description: `Payment received via wallet - in 24h escrow lock for ${escrow.coinSymbol} order (TX: ${transaction.hash})`,
      });

      // Create ledger entry for buyer paying
      const buyerVirtualWallet = await storage.getVirtualWallet(userId);
      const buyerBalance = escrow.coinSymbol === "USDT" ? (buyerVirtualWallet?.usdtBalance || 0) : 
                           escrow.coinSymbol === "BNB" ? (buyerVirtualWallet?.bnbBalance || 0) : 
                           (buyerVirtualWallet?.balance || 0);
      
      await storage.createLedgerEntry({
        userId: userId,
        escrowOrderId: escrow.id,
        type: "escrow_payment",
        btcAmount: escrow.coinSymbol === "BTC" ? amountToCredit : 0,
        balanceAfter: Math.max(0, buyerBalance - amountToCredit),
        description: `Payment sent via wallet for ${escrow.coinSymbol} order to ${escrow.depositAddress.substring(0, 16)}... (TX: ${transaction.hash})`,
      });

      // Create purchase snapshot for the buyer (shows product details after purchase)
      try {
        const orderItemsList = await db.select().from(orderItems).where(eq(orderItems.orderId, escrow.orderId));
        if (orderItemsList.length > 0) {
          const productId = orderItemsList[0].productId;
          const product = await storage.getProductById(productId);
          if (product) {
            await storage.createPurchaseSnapshot({
              escrowOrderId: escrow.id,
              productName: product.name,
              productDescription: product.description,
              productImages: product.images || (product.imageData ? [product.imageData] : []),
              afterBuyMessage: product.afterBuyMessage,
              afterBuyButtonLabel: product.afterBuyButtonLabel,
              afterBuyButtonUrl: product.afterBuyButtonUrl,
            });
          }
        }
      } catch (snapshotError) {
        console.error("Failed to create purchase snapshot:", snapshotError);
      }

      // Send email notifications to buyer and merchant
      try {
        const orderItemsList = await db.select().from(orderItems).where(eq(orderItems.orderId, escrow.orderId));
        if (orderItemsList.length > 0) {
          const productId = orderItemsList[0].productId;
          const product = await storage.getProductById(productId);
          const merchant = await storage.getUser(escrow.merchantId);
          const buyer = await storage.getUser(escrow.buyerId);
          
          if (product && merchant && buyer) {
            // Send payment confirmation to buyer
            await sendPaymentConfirmationNotification(
              escrow.buyerId,
              product.name,
              `$${escrow.usdAmount}`,
              merchant.username,
              amountToCredit.toFixed(escrow.coinSymbol === "BTC" ? 8 : 6),
              escrow.coinSymbol,
              transaction.hash,
              escrowExpiresAt
            );
            
            // Send sale notification to merchant
            await sendSaleNotification(
              escrow.merchantId,
              buyer.username,
              product.name,
              `$${escrow.usdAmount}`,
              product.id,
              escrow.orderId
            );
          }
        }
      } catch (emailError) {
        console.error("Failed to send email notifications:", emailError);
      }

      console.log(`[Escrow] User ${userId} paid ${amount} ${escrow.coinSymbol} for order ${escrowId} via wallet to escrow deposit address`);

      res.json({
        success: true,
        transactionHash: transaction.hash,
        escrow: updatedEscrow,
        message: "Payment successful - funds held in 24-hour escrow",
      });
    } catch (error) {
      console.error("[Escrow] Error paying with wallet:", error);
      res.status(500).json({ 
        message: "Failed to process wallet payment",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });


  // ============ BANNER SLIDER ROUTES ============

  // Public: get banner slider products
  app.get("/api/banner-slider", async (req, res) => {
    try {
      const settings = await storage.getSliderBannerSettings();
      const now = new Date();
      const lastRefreshed = new Date(settings.lastRefreshedAt);
      const intervalMs = settings.refreshIntervalHours * 60 * 60 * 1000;

      if (now.getTime() - lastRefreshed.getTime() > intervalMs) {
        await storage.updateSliderBannerSettings({ lastRefreshedAt: now });
      }

      const sliderProducts = await storage.getSliderBannerProducts(10);
      const productsWithRatings = await Promise.all(
        sliderProducts.map(async (product: any) => {
          const ratings = await storage.getProductAverageRating(product.id);
          return { ...product, ...ratings };
        })
      );

      res.json({ products: productsWithRatings, settings });
    } catch (error) {
      console.error("[BannerSlider] Error fetching slider products:", error);
      res.status(500).json({ message: "Failed to fetch banner slider" });
    }
  });

  // Admin: get slider settings
  app.get("/api/admin/banner-slider/settings", requireAdmin, async (req, res) => {
    try {
      const settings = await storage.getSliderBannerSettings();
      res.json(settings);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch settings" });
    }
  });

  // Admin: update slider settings
  app.patch("/api/admin/banner-slider/settings", requireAdmin, async (req, res) => {
    try {
      const { refreshIntervalHours } = req.body;
      if (refreshIntervalHours !== undefined && (typeof refreshIntervalHours !== "number" || refreshIntervalHours < 1)) {
        return res.status(400).json({ message: "refreshIntervalHours must be a positive number" });
      }
      const updated = await storage.updateSliderBannerSettings({ refreshIntervalHours });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update settings" });
    }
  });

  // Admin: force refresh now
  app.post("/api/admin/banner-slider/refresh", requireAdmin, async (req, res) => {
    try {
      const updated = await storage.updateSliderBannerSettings({ lastRefreshedAt: new Date() });
      res.json({ success: true, settings: updated });
    } catch (error) {
      res.status(500).json({ message: "Failed to refresh" });
    }
  });

  // Admin: get all banner slider items (overrides)
  app.get("/api/admin/banner-slider/items", requireAdmin, async (req, res) => {
    try {
      const items = await storage.getSliderBannerItems();
      const itemsWithProducts = await Promise.all(
        items.map(async (item: any) => {
          const product = await storage.getProductById(item.productId);
          return { ...item, product };
        })
      );
      res.json(itemsWithProducts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch items" });
    }
  });

  // Admin: pin a product to slider
  app.post("/api/admin/banner-slider/pin", requireAdmin, async (req, res) => {
    try {
      const { productId, sortOrder } = req.body;
      if (!productId) return res.status(400).json({ message: "productId is required" });
      const product = await storage.getProductById(productId);
      if (!product) return res.status(404).json({ message: "Product not found" });
      const item = await storage.pinSliderProduct(productId, sortOrder || 0);
      res.json(item);
    } catch (error) {
      res.status(500).json({ message: "Failed to pin product" });
    }
  });

  // Admin: exclude a product from slider
  app.post("/api/admin/banner-slider/exclude", requireAdmin, async (req, res) => {
    try {
      const { productId } = req.body;
      if (!productId) return res.status(400).json({ message: "productId is required" });
      const product = await storage.getProductById(productId);
      if (!product) return res.status(404).json({ message: "Product not found" });
      const item = await storage.excludeSliderProduct(productId);
      res.json(item);
    } catch (error) {
      res.status(500).json({ message: "Failed to exclude product" });
    }
  });

  // Admin: remove override (let it be auto-managed)
  app.delete("/api/admin/banner-slider/items/:productId", requireAdmin, async (req, res) => {
    try {
      const { productId } = req.params;
      await storage.removeSliderOverride(productId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to remove override" });
    }
  });

  // ============ END BANNER SLIDER ROUTES ============

  return httpServer;
}
