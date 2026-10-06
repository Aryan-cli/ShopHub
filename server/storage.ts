import { 
  users, products, reviews, favorites, merchantFollowers, orders, orderItems,
  conversations, conversationParticipants, messages, friendRequests, friends, userBlocks,
  forumPosts, forumLikes, forumComments,
  virtualWallets, escrowOrders, disputes, withdrawalRequests, ledgerEntries,
  paymentCoins, adminSettings, adminWallet, productFees, adminWithdrawalRequests, purchaseSnapshots,
  notificationSettings, mutedUsers, emailLogs, splashScreen, userWallets, paymentWallets, paymentSessions,
  type User, type InsertUser, 
  type Product, type InsertProduct,
  type Review, type InsertReview,
  type Favorite, type InsertFavorite,
  type Order, type InsertOrder,
  type OrderItem, type InsertOrderItem,
  type MerchantFollower,
  type Conversation, type ConversationParticipant,
  type Message, type InsertMessage,
  type FriendRequest, type Friend, type UserBlock,
  type ForumPost, type InsertForumPost,
  type ForumLike, type ForumComment, type InsertForumComment,
  type VirtualWallet, type InsertVirtualWallet,
  type EscrowOrder, type InsertEscrowOrder,
  type Dispute, type InsertDispute,
  type WithdrawalRequest, type InsertWithdrawalRequest,
  type LedgerEntry, type InsertLedgerEntry,
  type PaymentCoin, type InsertPaymentCoin,
  type AdminSetting, type InsertAdminSetting,
  type PurchaseSnapshot, type InsertPurchaseSnapshot,
  type NotificationSettings, type InsertNotificationSettings, type MutedUser,
  type EmailLog, type InsertEmailLog,
  type SplashScreen, type InsertSplashScreen,
  type UserWallet, type InsertUserWallet
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, avg, count, sql, and, or, ilike, lt, lte } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  createAdminUser(user: InsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;
  getUserCount(): Promise<number>;
  getMerchantCount(): Promise<number>;
  updateUser(id: string, data: Partial<User>): Promise<User | undefined>;
  blockUser(id: string): Promise<User | undefined>;
  unblockUser(id: string): Promise<User | undefined>;
  becomeMerchant(id: string): Promise<User | undefined>;
  deleteUser(id: string): Promise<boolean>;
  getUserTotalSpending(userId: string): Promise<number>;

  getAllProducts(): Promise<Product[]>;
  getProductById(id: string): Promise<Product | undefined>;
  getProductsByMerchantId(merchantId: string): Promise<Product[]>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: string, product: Partial<InsertProduct>): Promise<Product | undefined>;
  deleteProduct(id: string): Promise<boolean>;
  getProductCount(): Promise<number>;
  incrementViewCount(id: string): Promise<void>;
  decrementStock(id: string, qty: number): Promise<void>;
  incrementStock(id: string, qty: number): Promise<void>;
  searchProducts(query: string): Promise<Product[]>;

  getReviewsByProductId(productId: string): Promise<Review[]>;
  getReviewById(reviewId: string): Promise<Review | undefined>;
  createReview(review: InsertReview & { username: string; isVerifiedBuyer?: boolean; isMerchantReply?: boolean }): Promise<Review>;
  updateReview(reviewId: string, comment: string): Promise<Review | undefined>;
  deleteReview(reviewId: string): Promise<void>;
  getReviewCount(): Promise<number>;
  getAverageRating(): Promise<number>;
  getProductAverageRating(productId: string): Promise<{ averageRating: number; reviewCount: number }>;

  getFavoritesByUserId(userId: string): Promise<Favorite[]>;
  addFavorite(userId: string, productId: string): Promise<Favorite>;
  removeFavorite(userId: string, productId: string): Promise<boolean>;
  isFavorite(userId: string, productId: string): Promise<boolean>;

  followMerchant(followerId: string, merchantId: string): Promise<MerchantFollower>;
  unfollowMerchant(followerId: string, merchantId: string): Promise<boolean>;
  isFollowing(followerId: string, merchantId: string): Promise<boolean>;
  getFollowerCount(merchantId: string): Promise<number>;
  getFollowingMerchants(userId: string): Promise<User[]>;

  createOrder(order: InsertOrder): Promise<Order>;
  createOrderItem(orderItem: InsertOrderItem): Promise<OrderItem>;
  getOrdersByUserId(userId: string): Promise<Order[]>;
  getOrder(id: string): Promise<Order | undefined>;
  getOrderItems(orderId: string): Promise<OrderItem[]>;
  hasUserBoughtProduct(userId: string, productId: string): Promise<boolean>;

  createConversation(): Promise<Conversation>;
  addParticipant(conversationId: string, userId: string): Promise<ConversationParticipant>;
  getConversationsByUserId(userId: string): Promise<Conversation[]>;
  getConversationBetweenUsers(userId1: string, userId2: string): Promise<Conversation | undefined>;
  getConversationParticipants(conversationId: string): Promise<User[]>;
  
  createMessage(message: InsertMessage): Promise<Message>;
  getMessagesByConversationId(conversationId: string): Promise<Message[]>;
  updateMessage(id: string, content: string): Promise<Message | undefined>;
  deleteMessage(id: string): Promise<boolean>;
  markConversationAsRead(conversationId: string, userId: string): Promise<void>;
  getUnreadMessageCount(userId: string): Promise<number>;
  hasUnreadMessages(conversationId: string, userId: string): Promise<boolean>;

  sendFriendRequest(senderId: string, receiverId: string): Promise<FriendRequest>;
  acceptFriendRequest(requestId: string): Promise<void>;
  rejectFriendRequest(requestId: string): Promise<void>;
  getPendingFriendRequests(userId: string): Promise<FriendRequest[]>;
  getFriends(userId: string): Promise<User[]>;
  areFriends(userId1: string, userId2: string): Promise<boolean>;
  removeFriend(userId: string, friendId: string): Promise<boolean>;

  blockUserChat(blockerId: string, blockedId: string): Promise<UserBlock>;
  unblockUserChat(blockerId: string, blockedId: string): Promise<boolean>;
  isBlocked(blockerId: string, blockedId: string): Promise<boolean>;
  getBlockedUsers(userId: string): Promise<User[]>;

  createForumPost(post: InsertForumPost): Promise<ForumPost>;
  getAllForumPosts(): Promise<ForumPost[]>;
  getForumPostById(id: string): Promise<ForumPost | undefined>;
  deleteForumPost(id: string): Promise<boolean>;
  searchForumPosts(query: string): Promise<ForumPost[]>;
  getTrendingForumPosts(): Promise<ForumPost[]>;

  likeForumPost(userId: string, postId: string): Promise<ForumLike>;
  unlikeForumPost(userId: string, postId: string): Promise<boolean>;
  hasLikedPost(userId: string, postId: string): Promise<boolean>;

  createForumComment(comment: InsertForumComment): Promise<ForumComment>;
  getForumCommentsByPostId(postId: string): Promise<ForumComment[]>;

  // Virtual Wallet
  getVirtualWallet(userId: string): Promise<VirtualWallet | undefined>;
  createVirtualWallet(userId: string): Promise<VirtualWallet>;
  updateVirtualWalletBalance(userId: string, availableDelta: number, pendingDelta: number): Promise<VirtualWallet | undefined>;
  updateVirtualWalletBnbBalance(userId: string, availableDelta: number, pendingDelta: number): Promise<VirtualWallet | undefined>;
  updateVirtualWalletUsdtBalance(userId: string, availableDelta: number, pendingDelta: number): Promise<VirtualWallet | undefined>;

  // Escrow Orders
  createEscrowOrder(data: InsertEscrowOrder): Promise<EscrowOrder>;
  getEscrowOrder(id: string): Promise<EscrowOrder | undefined>;
  getEscrowOrderByOrderId(orderId: string): Promise<EscrowOrder | undefined>;
  getEscrowOrderByTransactionHash(txHash: string): Promise<EscrowOrder | undefined>;
  getEscrowOrdersByBuyer(buyerId: string): Promise<EscrowOrder[]>;
  getEscrowOrdersByMerchant(merchantId: string): Promise<EscrowOrder[]>;
  getAllEscrowOrders(): Promise<EscrowOrder[]>;
  updateEscrowOrder(id: string, data: Partial<EscrowOrder>): Promise<EscrowOrder | undefined>;
  getExpiredEscrowOrders(): Promise<EscrowOrder[]>;

  // Disputes
  createDispute(data: InsertDispute): Promise<Dispute>;
  getDispute(id: string): Promise<Dispute | undefined>;
  getDisputeByEscrowOrderId(escrowOrderId: string): Promise<Dispute | undefined>;
  getAllDisputes(): Promise<Dispute[]>;
  getOpenDisputes(): Promise<Dispute[]>;
  updateDispute(id: string, data: Partial<Dispute>): Promise<Dispute | undefined>;

  // Withdrawal Requests
  createWithdrawalRequest(data: InsertWithdrawalRequest): Promise<WithdrawalRequest>;
  getWithdrawalRequest(id: string): Promise<WithdrawalRequest | undefined>;
  getWithdrawalRequestsByMerchant(merchantId: string): Promise<WithdrawalRequest[]>;
  getAllWithdrawalRequests(): Promise<WithdrawalRequest[]>;
  getPendingWithdrawalRequests(): Promise<WithdrawalRequest[]>;
  updateWithdrawalRequest(id: string, data: Partial<WithdrawalRequest>): Promise<WithdrawalRequest | undefined>;

  // Ledger
  createLedgerEntry(data: InsertLedgerEntry): Promise<LedgerEntry>;
  getLedgerEntriesByUser(userId: string): Promise<LedgerEntry[]>;

  // Payment Coins
  getAllPaymentCoins(): Promise<PaymentCoin[]>;
  getEnabledPaymentCoins(): Promise<PaymentCoin[]>;
  getPaymentCoin(id: string): Promise<PaymentCoin | undefined>;
  getPaymentCoinBySymbol(symbol: string): Promise<PaymentCoin | undefined>;
  createPaymentCoin(data: InsertPaymentCoin): Promise<PaymentCoin>;
  updatePaymentCoin(id: string, data: Partial<PaymentCoin>): Promise<PaymentCoin | undefined>;

  // Admin Settings
  getAdminSetting(key: string): Promise<AdminSetting | undefined>;
  getAllAdminSettings(): Promise<AdminSetting[]>;
  setAdminSetting(key: string, value: string, description?: string, updatedBy?: string): Promise<AdminSetting>;

  // Purchase Snapshots
  createPurchaseSnapshot(data: InsertPurchaseSnapshot): Promise<PurchaseSnapshot>;
  getPurchaseSnapshotByEscrowOrderId(escrowOrderId: string): Promise<PurchaseSnapshot | undefined>;

  // Notification Settings
  getNotificationSettings(userId: string): Promise<NotificationSettings | undefined>;
  upsertNotificationSettings(userId: string, data: Partial<InsertNotificationSettings>): Promise<NotificationSettings>;

  // Muted Users
  muteUser(muterId: string, mutedId: string): Promise<MutedUser>;
  unmuteUser(muterId: string, mutedId: string): Promise<boolean>;
  isUserMuted(muterId: string, mutedId: string): Promise<boolean>;
  getMutedUsers(userId: string): Promise<User[]>;

  // Email Logs
  createEmailLog(data: InsertEmailLog): Promise<EmailLog>;
  getRecentEmailLogs(minutes: number): Promise<EmailLog[]>;
  getEmailLogCount(minutes: number): Promise<number>;

  getSliderBannerSettings(): Promise<any>;
  updateSliderBannerSettings(data: { refreshIntervalHours?: number; lastRefreshedAt?: Date }): Promise<any>;
  getSliderBannerItems(): Promise<any[]>;
  getSliderBannerProducts(limit: number): Promise<any[]>;
  pinSliderProduct(productId: string, sortOrder?: number): Promise<any>;
  excludeSliderProduct(productId: string): Promise<any>;
  removeSliderOverride(productId: string): Promise<boolean>;
  getTrendingProducts(excludeIds: string[], limit: number): Promise<any[]>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async createAdminUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({ ...insertUser, isAdmin: true })
      .returning();
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users);
  }

  async getUserCount(): Promise<number> {
    const [result] = await db.select({ count: count() }).from(users);
    return result?.count || 0;
  }

  async getMerchantCount(): Promise<number> {
    const [result] = await db.select({ count: count() }).from(users).where(eq(users.isMerchant, true));
    return result?.count || 0;
  }

  async updateUser(id: string, data: Partial<User>): Promise<User | undefined> {
    const [user] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return user || undefined;
  }

  async blockUser(id: string): Promise<User | undefined> {
    const [user] = await db.update(users).set({ isBlocked: true }).where(eq(users.id, id)).returning();
    return user || undefined;
  }

  async unblockUser(id: string): Promise<User | undefined> {
    const [user] = await db.update(users).set({ isBlocked: false }).where(eq(users.id, id)).returning();
    return user || undefined;
  }

  async becomeMerchant(id: string): Promise<User | undefined> {
    const [user] = await db.update(users).set({ isMerchant: true, merchantSince: new Date() }).where(eq(users.id, id)).returning();
    return user || undefined;
  }

  async deleteUser(id: string): Promise<boolean> {
    const result = await db.delete(users).where(eq(users.id, id)).returning();
    return result.length > 0;
  }

  async getUserTotalSpending(userId: string): Promise<number> {
    const [result] = await db
      .select({ total: sql<number>`COALESCE(SUM(CAST(${orders.totalAmount} AS DECIMAL)), 0)` })
      .from(orders)
      .where(eq(orders.userId, userId));
    return result?.total ? Number(result.total) : 0;
  }

  async getAllProducts(): Promise<Product[]> {
    return db.select().from(products).orderBy(desc(products.createdAt));
  }

  async getProductById(id: string): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    return product || undefined;
  }

  async getProductsByMerchantId(merchantId: string): Promise<Product[]> {
    return db.select().from(products).where(eq(products.merchantId, merchantId)).orderBy(desc(products.createdAt));
  }

  async createProduct(insertProduct: InsertProduct): Promise<Product> {
    const [product] = await db
      .insert(products)
      .values(insertProduct)
      .returning();
    return product;
  }

  async updateProduct(id: string, updateData: Partial<InsertProduct>): Promise<Product | undefined> {
    const [product] = await db
      .update(products)
      .set(updateData)
      .where(eq(products.id, id))
      .returning();
    return product || undefined;
  }

  async deleteProduct(id: string): Promise<boolean> {
    const result = await db.delete(products).where(eq(products.id, id)).returning();
    return result.length > 0;
  }

  async getProductCount(): Promise<number> {
    const [result] = await db.select({ count: count() }).from(products);
    return result?.count || 0;
  }

  async incrementViewCount(id: string): Promise<void> {
    await db.update(products).set({ viewCount: sql`${products.viewCount} + 1` }).where(eq(products.id, id));
  }

  async decrementStock(id: string, qty: number): Promise<void> {
    await db.update(products)
      .set({ stockQuantity: sql`GREATEST(${products.stockQuantity} - ${qty}, 0)` })
      .where(and(eq(products.id, id), sql`${products.stockQuantity} IS NOT NULL`));
  }

  async incrementStock(id: string, qty: number): Promise<void> {
    await db.update(products)
      .set({ stockQuantity: sql`${products.stockQuantity} + ${qty}` })
      .where(and(eq(products.id, id), sql`${products.stockQuantity} IS NOT NULL`));
  }

  async searchProducts(query: string): Promise<Product[]> {
    return db.select().from(products).where(
      or(
        ilike(products.name, `%${query}%`),
        ilike(products.description, `%${query}%`)
      )
    ).orderBy(desc(products.createdAt));
  }

  async getReviewsByProductId(productId: string): Promise<Review[]> {
      const reviewsWithRatings = await db
        .select()
        .from(reviews)
        .where(eq(reviews.productId, productId))
        .orderBy(desc(reviews.createdAt));
      return reviewsWithRatings as Review[];
  }

  async getReviewById(reviewId: string): Promise<Review | undefined> {
    const [review] = await db.select().from(reviews).where(eq(reviews.id, reviewId));
    return review;
  }

  async createReview(insertReview: InsertReview & { username: string; isVerifiedBuyer?: boolean; isMerchantReply?: boolean }): Promise<Review> {
    const [review] = await db
      .insert(reviews)
      .values(insertReview)
      .returning();
    return review;
  }

  async updateReview(reviewId: string, comment: string): Promise<Review | undefined> {
    const [updated] = await db
      .update(reviews)
      .set({ comment, isEdited: true })
      .where(eq(reviews.id, reviewId))
      .returning();
    return updated;
  }

  async deleteReview(reviewId: string): Promise<void> {
    await db.delete(reviews).where(eq(reviews.id, reviewId));
  }

  async getReviewCount(): Promise<number> {
    const [result] = await db.select({ count: count() }).from(reviews);
    return result?.count || 0;
  }

  async getAverageRating(): Promise<number> {
    const [result] = await db.select({ avg: avg(reviews.rating) }).from(reviews).where(sql`${reviews.rating} IS NOT NULL`);
    return result?.avg ? parseFloat(result.avg) : 0;
  }

  async getProductAverageRating(productId: string): Promise<{ averageRating: number; reviewCount: number }> {
    const [result] = await db
      .select({ 
        avg: avg(reviews.rating),
        count: count()
      })
      .from(reviews)
      .where(and(eq(reviews.productId, productId), sql`${reviews.rating} IS NOT NULL`));
    
    return {
      averageRating: result?.avg ? parseFloat(result.avg) : 0,
      reviewCount: result?.count || 0,
    };
  }

  async getFavoritesByUserId(userId: string): Promise<Favorite[]> {
    return db.select().from(favorites).where(eq(favorites.userId, userId));
  }

  async addFavorite(userId: string, productId: string): Promise<Favorite> {
    const [favorite] = await db.insert(favorites).values({ userId, productId }).returning();
    return favorite;
  }

  async removeFavorite(userId: string, productId: string): Promise<boolean> {
    const result = await db.delete(favorites).where(and(eq(favorites.userId, userId), eq(favorites.productId, productId))).returning();
    return result.length > 0;
  }

  async isFavorite(userId: string, productId: string): Promise<boolean> {
    const [result] = await db.select().from(favorites).where(and(eq(favorites.userId, userId), eq(favorites.productId, productId)));
    return !!result;
  }

  async followMerchant(followerId: string, merchantId: string): Promise<MerchantFollower> {
    const [follow] = await db.insert(merchantFollowers).values({ followerId, merchantId }).returning();
    return follow;
  }

  async unfollowMerchant(followerId: string, merchantId: string): Promise<boolean> {
    const result = await db.delete(merchantFollowers).where(and(eq(merchantFollowers.followerId, followerId), eq(merchantFollowers.merchantId, merchantId))).returning();
    return result.length > 0;
  }

  async isFollowing(followerId: string, merchantId: string): Promise<boolean> {
    const [result] = await db.select().from(merchantFollowers).where(and(eq(merchantFollowers.followerId, followerId), eq(merchantFollowers.merchantId, merchantId)));
    return !!result;
  }

  async getFollowerCount(merchantId: string): Promise<number> {
    const [result] = await db.select({ count: count() }).from(merchantFollowers).where(eq(merchantFollowers.merchantId, merchantId));
    return result?.count || 0;
  }

  async getFollowingMerchants(userId: string): Promise<User[]> {
    const following = await db.select().from(merchantFollowers).where(eq(merchantFollowers.followerId, userId));
    const merchantIds = following.map(f => f.merchantId);
    if (merchantIds.length === 0) return [];
    const merchants = await Promise.all(merchantIds.map(id => this.getUser(id)));
    return merchants.filter((m): m is User => m !== undefined);
  }

  async createOrder(order: InsertOrder): Promise<Order> {
    const [newOrder] = await db.insert(orders).values(order).returning();
    return newOrder;
  }

  async createOrderItem(orderItem: InsertOrderItem): Promise<OrderItem> {
    const [item] = await db.insert(orderItems).values(orderItem).returning();
    return item;
  }

  async getOrdersByUserId(userId: string): Promise<Order[]> {
    return db.select().from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.createdAt));
  }

  async getOrder(id: string): Promise<Order | undefined> {
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    return order || undefined;
  }

  async getOrderItems(orderId: string): Promise<OrderItem[]> {
    return db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  }

  async hasUserBoughtProduct(userId: string, productId: string): Promise<boolean> {
    const userOrders = await db.select().from(orders).where(eq(orders.userId, userId));
    if (userOrders.length === 0) return false;
    
    for (const order of userOrders) {
      const items = await db.select().from(orderItems).where(and(eq(orderItems.orderId, order.id), eq(orderItems.productId, productId)));
      if (items.length > 0) {
        // Check if the escrow payment was confirmed (status must be escrow, completed, or released)
        const [escrow] = await db.select().from(escrowOrders).where(eq(escrowOrders.orderId, order.id));
        if (escrow && (escrow.status === "escrow" || escrow.status === "completed" || escrow.status === "released")) {
          return true;
        }
      }
    }
    return false;
  }

  async createConversation(): Promise<Conversation> {
    const [conversation] = await db.insert(conversations).values({}).returning();
    return conversation;
  }

  async addParticipant(conversationId: string, userId: string): Promise<ConversationParticipant> {
    const [participant] = await db.insert(conversationParticipants).values({ conversationId, userId }).returning();
    return participant;
  }

  async getConversationsByUserId(userId: string): Promise<Conversation[]> {
    const participations = await db.select().from(conversationParticipants).where(eq(conversationParticipants.userId, userId));
    const convIds = participations.map(p => p.conversationId);
    if (convIds.length === 0) return [];
    const convs = await Promise.all(convIds.map(id => db.select().from(conversations).where(eq(conversations.id, id))));
    return convs.flat();
  }

  async getConversationBetweenUsers(userId1: string, userId2: string): Promise<Conversation | undefined> {
    const user1Convs = await db.select().from(conversationParticipants).where(eq(conversationParticipants.userId, userId1));
    
    for (const conv of user1Convs) {
      const participants = await db.select().from(conversationParticipants).where(eq(conversationParticipants.conversationId, conv.conversationId));
      if (participants.length === 2 && participants.some(p => p.userId === userId2)) {
        const [conversation] = await db.select().from(conversations).where(eq(conversations.id, conv.conversationId));
        return conversation;
      }
    }
    return undefined;
  }

  async getConversationParticipants(conversationId: string): Promise<User[]> {
    const participants = await db.select().from(conversationParticipants).where(eq(conversationParticipants.conversationId, conversationId));
    const usersList = await Promise.all(participants.map(p => this.getUser(p.userId)));
    return usersList.filter((u): u is User => u !== undefined);
  }

  async createMessage(message: InsertMessage): Promise<Message> {
    const [msg] = await db.insert(messages).values(message).returning();
    await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, message.conversationId));
    return msg;
  }

  async getMessagesByConversationId(conversationId: string): Promise<Message[]> {
    return db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(messages.createdAt);
  }

  async updateMessage(id: string, content: string): Promise<Message | undefined> {
    const [msg] = await db.update(messages).set({ content, isEdited: true, editedAt: new Date() }).where(eq(messages.id, id)).returning();
    return msg || undefined;
  }

  async deleteMessage(id: string): Promise<boolean> {
    const [msg] = await db.update(messages).set({ isDeleted: true, content: null }).where(eq(messages.id, id)).returning();
    return !!msg;
  }

  // Store lastReadAt timestamps in memory (in production, this should be in DB)
  private lastReadTimestamps: Map<string, Date> = new Map();

  async markConversationAsRead(conversationId: string, userId: string): Promise<void> {
    const key = `${conversationId}:${userId}`;
    this.lastReadTimestamps.set(key, new Date());
  }

  async hasUnreadMessages(conversationId: string, userId: string): Promise<boolean> {
    const key = `${conversationId}:${userId}`;
    const lastRead = this.lastReadTimestamps.get(key);
    
    // Get the latest message in this conversation from someone other than the user
    const allMessages = await db.select().from(messages)
      .where(and(
        eq(messages.conversationId, conversationId),
        sql`${messages.senderId} != ${userId}`
      ))
      .orderBy(desc(messages.createdAt))
      .limit(1);
    
    if (allMessages.length === 0) return false;
    
    const latestMessage = allMessages[0];
    if (!lastRead) {
      // If never read, check if there's any message from others
      return true;
    }
    
    return new Date(latestMessage.createdAt) > lastRead;
  }

  async getConversationReadStatuses(conversationId: string): Promise<Record<string, string | null>> {
    const participants = await this.getConversationParticipants(conversationId);
    const result: Record<string, string | null> = {};
    for (const p of participants) {
      const key = `${conversationId}:${p.id}`;
      const ts = this.lastReadTimestamps.get(key);
      result[p.id] = ts ? ts.toISOString() : null;
    }
    return result;
  }

  async getUnreadMessageCount(userId: string): Promise<number> {
    const convs = await this.getConversationsByUserId(userId);
    let count = 0;
    
    for (const conv of convs) {
      const hasUnread = await this.hasUnreadMessages(conv.id, userId);
      if (hasUnread) count++;
    }
    
    return count;
  }

  async sendFriendRequest(senderId: string, receiverId: string): Promise<FriendRequest> {
    const [request] = await db.insert(friendRequests).values({ senderId, receiverId }).returning();
    return request;
  }

  async acceptFriendRequest(requestId: string): Promise<void> {
    const [request] = await db.select().from(friendRequests).where(eq(friendRequests.id, requestId));
    if (request) {
      await db.insert(friends).values({ userId: request.senderId, friendId: request.receiverId });
      await db.insert(friends).values({ userId: request.receiverId, friendId: request.senderId });
      await db.update(friendRequests).set({ status: "accepted" }).where(eq(friendRequests.id, requestId));
    }
  }

  async rejectFriendRequest(requestId: string): Promise<void> {
    await db.update(friendRequests).set({ status: "rejected" }).where(eq(friendRequests.id, requestId));
  }

  async getPendingFriendRequests(userId: string): Promise<FriendRequest[]> {
    return db.select().from(friendRequests).where(and(eq(friendRequests.receiverId, userId), eq(friendRequests.status, "pending")));
  }

  async getFriends(userId: string): Promise<User[]> {
    const friendships = await db.select().from(friends).where(eq(friends.userId, userId));
    const friendUsers = await Promise.all(friendships.map(f => this.getUser(f.friendId)));
    return friendUsers.filter((u): u is User => u !== undefined);
  }

  async areFriends(userId1: string, userId2: string): Promise<boolean> {
    const [result] = await db.select().from(friends).where(and(eq(friends.userId, userId1), eq(friends.friendId, userId2)));
    return !!result;
  }

  async removeFriend(userId: string, friendId: string): Promise<boolean> {
    await db.delete(friends).where(and(eq(friends.userId, userId), eq(friends.friendId, friendId)));
    await db.delete(friends).where(and(eq(friends.userId, friendId), eq(friends.friendId, userId)));
    return true;
  }

  async blockUserChat(blockerId: string, blockedId: string): Promise<UserBlock> {
    const [block] = await db.insert(userBlocks).values({ blockerId, blockedId }).returning();
    return block;
  }

  async unblockUserChat(blockerId: string, blockedId: string): Promise<boolean> {
    const result = await db.delete(userBlocks).where(and(eq(userBlocks.blockerId, blockerId), eq(userBlocks.blockedId, blockedId))).returning();
    return result.length > 0;
  }

  async isBlocked(blockerId: string, blockedId: string): Promise<boolean> {
    const [result] = await db.select().from(userBlocks).where(and(eq(userBlocks.blockerId, blockerId), eq(userBlocks.blockedId, blockedId)));
    return !!result;
  }

  async getBlockedUsers(userId: string): Promise<User[]> {
    const blocks = await db.select().from(userBlocks).where(eq(userBlocks.blockerId, userId));
    const blockedUsers = await Promise.all(blocks.map(b => this.getUser(b.blockedId)));
    return blockedUsers.filter((u): u is User => u !== undefined);
  }

  async createForumPost(post: InsertForumPost): Promise<ForumPost> {
    const [forumPost] = await db.insert(forumPosts).values(post).returning();
    return forumPost;
  }

  async getAllForumPosts(): Promise<ForumPost[]> {
    return db.select().from(forumPosts).orderBy(desc(forumPosts.createdAt));
  }

  async getForumPostById(id: string): Promise<ForumPost | undefined> {
    const [post] = await db.select().from(forumPosts).where(eq(forumPosts.id, id));
    return post || undefined;
  }

  async deleteForumPost(id: string): Promise<boolean> {
    const result = await db.delete(forumPosts).where(eq(forumPosts.id, id)).returning();
    return result.length > 0;
  }

  async searchForumPosts(query: string): Promise<ForumPost[]> {
    return db.select().from(forumPosts).where(ilike(forumPosts.content, `%${query}%`)).orderBy(desc(forumPosts.createdAt));
  }

  async getTrendingForumPosts(): Promise<ForumPost[]> {
    return db.select().from(forumPosts).orderBy(desc(forumPosts.likeCount), desc(forumPosts.commentCount)).limit(20);
  }

  async likeForumPost(userId: string, postId: string): Promise<ForumLike> {
    const [like] = await db.insert(forumLikes).values({ userId, postId }).returning();
    await db.update(forumPosts).set({ likeCount: sql`${forumPosts.likeCount} + 1` }).where(eq(forumPosts.id, postId));
    return like;
  }

  async unlikeForumPost(userId: string, postId: string): Promise<boolean> {
    const result = await db.delete(forumLikes).where(and(eq(forumLikes.userId, userId), eq(forumLikes.postId, postId))).returning();
    if (result.length > 0) {
      await db.update(forumPosts).set({ likeCount: sql`${forumPosts.likeCount} - 1` }).where(eq(forumPosts.id, postId));
    }
    return result.length > 0;
  }

  async hasLikedPost(userId: string, postId: string): Promise<boolean> {
    const [result] = await db.select().from(forumLikes).where(and(eq(forumLikes.userId, userId), eq(forumLikes.postId, postId)));
    return !!result;
  }

  async createForumComment(comment: InsertForumComment): Promise<ForumComment> {
    const [forumComment] = await db.insert(forumComments).values(comment).returning();
    await db.update(forumPosts).set({ commentCount: sql`${forumPosts.commentCount} + 1` }).where(eq(forumPosts.id, comment.postId));
    return forumComment;
  }

  async getForumCommentsByPostId(postId: string): Promise<ForumComment[]> {
    return db.select().from(forumComments).where(eq(forumComments.postId, postId)).orderBy(forumComments.createdAt);
  }

  async updateForumPost(id: string, content: string): Promise<ForumPost | undefined> {
    const [post] = await db.update(forumPosts).set({ content }).where(eq(forumPosts.id, id)).returning();
    return post || undefined;
  }

  async getForumCommentById(id: string): Promise<ForumComment | undefined> {
    const [comment] = await db.select().from(forumComments).where(eq(forumComments.id, id));
    return comment || undefined;
  }

  async updateForumComment(id: string, content: string): Promise<ForumComment | undefined> {
    const [comment] = await db.update(forumComments).set({ content }).where(eq(forumComments.id, id)).returning();
    return comment || undefined;
  }

  async deleteForumComment(id: string, postId: string): Promise<boolean> {
    const result = await db.delete(forumComments).where(eq(forumComments.id, id)).returning();
    if (result.length > 0) {
      await db.update(forumPosts).set({ commentCount: sql`${forumPosts.commentCount} - 1` }).where(eq(forumPosts.id, postId));
    }
    return result.length > 0;
  }

  // ============ VIRTUAL WALLET ============

  async getVirtualWallet(userId: string): Promise<VirtualWallet | undefined> {
    const [wallet] = await db.select().from(virtualWallets).where(eq(virtualWallets.userId, userId));
    return wallet || undefined;
  }

  async createVirtualWallet(userId: string): Promise<VirtualWallet> {
    const [wallet] = await db.insert(virtualWallets).values({ userId, availableBalance: 0, pendingBalance: 0, totalEarned: 0 }).returning();
    return wallet;
  }

  async updateVirtualWalletBalance(userId: string, availableDelta: number, pendingDelta: number): Promise<VirtualWallet | undefined> {
    const wallet = await this.getVirtualWallet(userId);
    if (!wallet) return undefined;
    
    const newAvailable = wallet.availableBalance + availableDelta;
    const newPending = wallet.pendingBalance + pendingDelta;
    const newTotalEarned = availableDelta > 0 ? wallet.totalEarned + availableDelta : wallet.totalEarned;
    
    const [updated] = await db.update(virtualWallets)
      .set({ 
        availableBalance: newAvailable, 
        pendingBalance: newPending, 
        totalEarned: newTotalEarned,
        updatedAt: new Date() 
      })
      .where(eq(virtualWallets.userId, userId))
      .returning();
    return updated || undefined;
  }

  async updateVirtualWalletBnbBalance(userId: string, availableDelta: number, pendingDelta: number): Promise<VirtualWallet | undefined> {
    const wallet = await this.getVirtualWallet(userId);
    if (!wallet) return undefined;
    
    const newAvailable = (wallet.bnbAvailableBalance || 0) + availableDelta;
    const newPending = (wallet.bnbPendingBalance || 0) + pendingDelta;
    const newTotalEarned = availableDelta > 0 ? (wallet.bnbTotalEarned || 0) + availableDelta : (wallet.bnbTotalEarned || 0);
    
    const [updated] = await db.update(virtualWallets)
      .set({ 
        bnbAvailableBalance: newAvailable, 
        bnbPendingBalance: newPending, 
        bnbTotalEarned: newTotalEarned,
        updatedAt: new Date() 
      })
      .where(eq(virtualWallets.userId, userId))
      .returning();
    return updated || undefined;
  }

  async updateVirtualWalletUsdtBalance(userId: string, availableDelta: number, pendingDelta: number): Promise<VirtualWallet | undefined> {
    const wallet = await this.getVirtualWallet(userId);
    if (!wallet) return undefined;
    
    const newAvailable = (wallet.usdtAvailableBalance || 0) + availableDelta;
    const newPending = (wallet.usdtPendingBalance || 0) + pendingDelta;
    const newTotalEarned = availableDelta > 0 ? (wallet.usdtTotalEarned || 0) + availableDelta : (wallet.usdtTotalEarned || 0);
    
    const [updated] = await db.update(virtualWallets)
      .set({ 
        usdtAvailableBalance: newAvailable, 
        usdtPendingBalance: newPending, 
        usdtTotalEarned: newTotalEarned,
        updatedAt: new Date() 
      })
      .where(eq(virtualWallets.userId, userId))
      .returning();
    return updated || undefined;
  }

  // ============ ESCROW ORDERS ============

  async createEscrowOrder(data: InsertEscrowOrder): Promise<EscrowOrder> {
    const [escrow] = await db.insert(escrowOrders).values(data).returning();
    return escrow;
  }

  async getEscrowOrder(id: string): Promise<EscrowOrder | undefined> {
    const [escrow] = await db.select().from(escrowOrders).where(eq(escrowOrders.id, id));
    return escrow || undefined;
  }

  async getEscrowOrderByOrderId(orderId: string): Promise<EscrowOrder | undefined> {
    const [escrow] = await db.select().from(escrowOrders).where(eq(escrowOrders.orderId, orderId));
    return escrow || undefined;
  }

  async getEscrowOrderByTransactionHash(txHash: string): Promise<EscrowOrder | undefined> {
    const [escrow] = await db.select().from(escrowOrders).where(eq(escrowOrders.transactionHash, txHash));
    return escrow || undefined;
  }

  async getEscrowOrdersByBuyer(buyerId: string): Promise<EscrowOrder[]> {
    return db.select().from(escrowOrders).where(eq(escrowOrders.buyerId, buyerId)).orderBy(desc(escrowOrders.createdAt));
  }

  async getEscrowOrdersByMerchant(merchantId: string): Promise<EscrowOrder[]> {
    return db.select().from(escrowOrders).where(eq(escrowOrders.merchantId, merchantId)).orderBy(desc(escrowOrders.createdAt));
  }

  async getAllEscrowOrders(): Promise<EscrowOrder[]> {
    return db.select().from(escrowOrders).orderBy(desc(escrowOrders.createdAt));
  }

  async updateEscrowOrder(id: string, data: Partial<EscrowOrder>): Promise<EscrowOrder | undefined> {
    const [escrow] = await db.update(escrowOrders).set(data).where(eq(escrowOrders.id, id)).returning();
    return escrow || undefined;
  }

  async getExpiredEscrowOrders(): Promise<EscrowOrder[]> {
    return db.select().from(escrowOrders)
      .where(and(
        eq(escrowOrders.status, "escrow"),
        lte(escrowOrders.escrowExpiresAt, new Date())
      ));
  }

  // ============ DISPUTES ============

  async createDispute(data: InsertDispute): Promise<Dispute> {
    const [dispute] = await db.insert(disputes).values(data).returning();
    return dispute;
  }

  async getDispute(id: string): Promise<Dispute | undefined> {
    const [dispute] = await db.select().from(disputes).where(eq(disputes.id, id));
    return dispute || undefined;
  }

  async getDisputeByEscrowOrderId(escrowOrderId: string): Promise<Dispute | undefined> {
    const [dispute] = await db.select().from(disputes).where(eq(disputes.escrowOrderId, escrowOrderId));
    return dispute || undefined;
  }

  async getAllDisputes(): Promise<Dispute[]> {
    return db.select().from(disputes).orderBy(desc(disputes.createdAt));
  }

  async getOpenDisputes(): Promise<Dispute[]> {
    return db.select().from(disputes).where(eq(disputes.status, "open")).orderBy(desc(disputes.createdAt));
  }

  async updateDispute(id: string, data: Partial<Dispute>): Promise<Dispute | undefined> {
    const [dispute] = await db.update(disputes).set(data).where(eq(disputes.id, id)).returning();
    return dispute || undefined;
  }

  // ============ WITHDRAWAL REQUESTS ============

  async createWithdrawalRequest(data: InsertWithdrawalRequest): Promise<WithdrawalRequest> {
    const [request] = await db.insert(withdrawalRequests).values(data).returning();
    return request;
  }

  async getWithdrawalRequest(id: string): Promise<WithdrawalRequest | undefined> {
    const [request] = await db.select().from(withdrawalRequests).where(eq(withdrawalRequests.id, id));
    return request || undefined;
  }

  async getWithdrawalRequestsByMerchant(merchantId: string): Promise<WithdrawalRequest[]> {
    return db.select().from(withdrawalRequests).where(eq(withdrawalRequests.merchantId, merchantId)).orderBy(desc(withdrawalRequests.createdAt));
  }

  async getAllWithdrawalRequests(): Promise<WithdrawalRequest[]> {
    return db.select().from(withdrawalRequests).orderBy(desc(withdrawalRequests.createdAt));
  }

  async getPendingWithdrawalRequests(): Promise<WithdrawalRequest[]> {
    return db.select().from(withdrawalRequests).where(eq(withdrawalRequests.status, "pending")).orderBy(desc(withdrawalRequests.createdAt));
  }

  async updateWithdrawalRequest(id: string, data: Partial<WithdrawalRequest>): Promise<WithdrawalRequest | undefined> {
    const [request] = await db.update(withdrawalRequests).set(data).where(eq(withdrawalRequests.id, id)).returning();
    return request || undefined;
  }

  // ============ LEDGER ============

  async createLedgerEntry(data: InsertLedgerEntry): Promise<LedgerEntry> {
    const [entry] = await db.insert(ledgerEntries).values(data).returning();
    return entry;
  }

  async getLedgerEntriesByUser(userId: string): Promise<LedgerEntry[]> {
    return db.select().from(ledgerEntries).where(eq(ledgerEntries.userId, userId)).orderBy(desc(ledgerEntries.createdAt));
  }

  // ============ PAYMENT COINS ============

  async getAllPaymentCoins(): Promise<PaymentCoin[]> {
    return db.select().from(paymentCoins).orderBy(paymentCoins.sortOrder);
  }

  async getEnabledPaymentCoins(): Promise<PaymentCoin[]> {
    return db.select().from(paymentCoins).where(eq(paymentCoins.isEnabled, true)).orderBy(paymentCoins.sortOrder);
  }

  async getPaymentCoin(id: string): Promise<PaymentCoin | undefined> {
    const [coin] = await db.select().from(paymentCoins).where(eq(paymentCoins.id, id));
    return coin || undefined;
  }

  async getPaymentCoinBySymbol(symbol: string): Promise<PaymentCoin | undefined> {
    const [coin] = await db.select().from(paymentCoins).where(eq(paymentCoins.symbol, symbol));
    return coin || undefined;
  }

  async createPaymentCoin(data: InsertPaymentCoin): Promise<PaymentCoin> {
    const [coin] = await db.insert(paymentCoins).values(data).returning();
    return coin;
  }

  async updatePaymentCoin(id: string, data: Partial<PaymentCoin>): Promise<PaymentCoin | undefined> {
    const [coin] = await db.update(paymentCoins).set({ ...data, updatedAt: new Date() }).where(eq(paymentCoins.id, id)).returning();
    return coin || undefined;
  }

  // ============ ADMIN SETTINGS ============

  async getAdminSetting(key: string): Promise<AdminSetting | undefined> {
    const [setting] = await db.select().from(adminSettings).where(eq(adminSettings.key, key));
    return setting || undefined;
  }

  async getAllAdminSettings(): Promise<AdminSetting[]> {
    return db.select().from(adminSettings);
  }

  async setAdminSetting(key: string, value: string, description?: string, updatedBy?: string): Promise<AdminSetting> {
    const existing = await this.getAdminSetting(key);
    if (existing) {
      const [setting] = await db.update(adminSettings).set({ value, description, updatedBy, updatedAt: new Date() }).where(eq(adminSettings.key, key)).returning();
      return setting;
    } else {
      const [setting] = await db.insert(adminSettings).values({ key, value, description, updatedBy }).returning();
      return setting;
    }
  }

  // ============ ADMIN WALLET ============

  async getAdminWallet(): Promise<typeof adminWallet.$inferSelect | undefined> {
    const [wallet] = await db.select().from(adminWallet);
    return wallet || undefined;
  }

  async getOrCreateAdminWallet(): Promise<typeof adminWallet.$inferSelect> {
    let wallet = await this.getAdminWallet();
    if (!wallet) {
      const [newWallet] = await db.insert(adminWallet).values({}).returning();
      wallet = newWallet;
    }
    return wallet;
  }

  async updateAdminWalletBalance(btcDelta: number, bnbDelta: number, usdtDelta: number = 0): Promise<typeof adminWallet.$inferSelect | undefined> {
    const wallet = await this.getOrCreateAdminWallet();
    const [updated] = await db.update(adminWallet).set({
      btcBalance: wallet.btcBalance + btcDelta,
      bnbBalance: wallet.bnbBalance + bnbDelta,
      usdtBalance: wallet.usdtBalance + usdtDelta,
      totalBtcEarned: btcDelta > 0 ? wallet.totalBtcEarned + btcDelta : wallet.totalBtcEarned,
      totalBnbEarned: bnbDelta > 0 ? wallet.totalBnbEarned + bnbDelta : wallet.totalBnbEarned,
      totalUsdtEarned: usdtDelta > 0 ? wallet.totalUsdtEarned + usdtDelta : wallet.totalUsdtEarned,
      updatedAt: new Date(),
    }).where(eq(adminWallet.id, wallet.id)).returning();
    return updated;
  }

  async updateAdminWallet(walletId: string, data: Partial<typeof adminWallet.$inferSelect>): Promise<typeof adminWallet.$inferSelect | undefined> {
    const [updated] = await db.update(adminWallet).set({
      ...data,
      updatedAt: new Date(),
    }).where(eq(adminWallet.id, walletId)).returning();
    return updated;
  }

  async setAdminWithdrawalAddresses(btcAddress?: string, bnbAddress?: string, usdtAddress?: string): Promise<typeof adminWallet.$inferSelect | undefined> {
    const wallet = await this.getOrCreateAdminWallet();
    const [updated] = await db.update(adminWallet).set({
      btcWithdrawalAddress: btcAddress ?? wallet.btcWithdrawalAddress,
      bnbWithdrawalAddress: bnbAddress ?? wallet.bnbWithdrawalAddress,
      usdtWithdrawalAddress: usdtAddress ?? wallet.usdtWithdrawalAddress,
      updatedAt: new Date(),
    }).where(eq(adminWallet.id, wallet.id)).returning();
    return updated;
  }

  async getAdminSeed(): Promise<string | undefined> {
    const wallet = await this.getAdminWallet();
    return wallet?.adminSeed || undefined;
  }

  async setAdminSeed(encryptedSeed: string): Promise<typeof adminWallet.$inferSelect | undefined> {
    const wallet = await this.getOrCreateAdminWallet();
    const [updated] = await db.update(adminWallet).set({
      adminSeed: encryptedSeed,
      updatedAt: new Date(),
    }).where(eq(adminWallet.id, wallet.id)).returning();
    return updated;
  }

  // ============ PRODUCT FEES ============

  async getProductFee(productId: string): Promise<typeof productFees.$inferSelect | undefined> {
    const [fee] = await db.select().from(productFees).where(eq(productFees.productId, productId));
    return fee || undefined;
  }

  async setProductFee(productId: string, feePercent: number, updatedBy?: string): Promise<typeof productFees.$inferSelect> {
    const existing = await this.getProductFee(productId);
    if (existing) {
      const [fee] = await db.update(productFees).set({ feePercent, updatedBy }).where(eq(productFees.productId, productId)).returning();
      return fee;
    } else {
      const [fee] = await db.insert(productFees).values({ productId, feePercent, updatedBy }).returning();
      return fee;
    }
  }

  async deleteProductFee(productId: string): Promise<boolean> {
    const result = await db.delete(productFees).where(eq(productFees.productId, productId));
    return true;
  }

  async getAllProductFees(): Promise<(typeof productFees.$inferSelect)[]> {
    return db.select().from(productFees);
  }

  // ============ ADMIN WITHDRAWAL REQUESTS ============

  async createAdminWithdrawalRequest(coinSymbol: string, amount: number, toAddress: string): Promise<typeof adminWithdrawalRequests.$inferSelect> {
    const [request] = await db.insert(adminWithdrawalRequests).values({ coinSymbol, amount, toAddress }).returning();
    return request;
  }

  async getAdminWithdrawalRequests(): Promise<(typeof adminWithdrawalRequests.$inferSelect)[]> {
    return db.select().from(adminWithdrawalRequests).orderBy(desc(adminWithdrawalRequests.createdAt));
  }

  async updateAdminWithdrawalRequest(id: string, data: Partial<typeof adminWithdrawalRequests.$inferSelect>): Promise<typeof adminWithdrawalRequests.$inferSelect | undefined> {
    const [request] = await db.update(adminWithdrawalRequests).set(data).where(eq(adminWithdrawalRequests.id, id)).returning();
    return request || undefined;
  }

  // ============ PURCHASE SNAPSHOTS ============

  async createPurchaseSnapshot(data: InsertPurchaseSnapshot): Promise<PurchaseSnapshot> {
    const [snapshot] = await db.insert(purchaseSnapshots).values(data).returning();
    return snapshot;
  }

  async getPurchaseSnapshotByEscrowOrderId(escrowOrderId: string): Promise<PurchaseSnapshot | undefined> {
    const [snapshot] = await db.select().from(purchaseSnapshots).where(eq(purchaseSnapshots.escrowOrderId, escrowOrderId));
    return snapshot || undefined;
  }

  // ============ NOTIFICATION SETTINGS ============

  async getNotificationSettings(userId: string): Promise<NotificationSettings | undefined> {
    const [settings] = await db.select().from(notificationSettings).where(eq(notificationSettings.userId, userId));
    return settings || undefined;
  }

  async upsertNotificationSettings(userId: string, data: Partial<InsertNotificationSettings>): Promise<NotificationSettings> {
    const existing = await this.getNotificationSettings(userId);
    if (existing) {
      const [updated] = await db.update(notificationSettings)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(notificationSettings.userId, userId))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(notificationSettings)
        .values({ userId, ...data })
        .returning();
      return created;
    }
  }

  // ============ MUTED USERS ============

  async muteUser(muterId: string, mutedId: string): Promise<MutedUser> {
    const existing = await this.isUserMuted(muterId, mutedId);
    if (existing) {
      const [muted] = await db.select().from(mutedUsers).where(
        and(eq(mutedUsers.muterId, muterId), eq(mutedUsers.mutedId, mutedId))
      );
      return muted;
    }
    const [muted] = await db.insert(mutedUsers).values({ muterId, mutedId }).returning();
    return muted;
  }

  async unmuteUser(muterId: string, mutedId: string): Promise<boolean> {
    await db.delete(mutedUsers).where(
      and(eq(mutedUsers.muterId, muterId), eq(mutedUsers.mutedId, mutedId))
    );
    return true;
  }

  async isUserMuted(muterId: string, mutedId: string): Promise<boolean> {
    const [result] = await db.select().from(mutedUsers).where(
      and(eq(mutedUsers.muterId, muterId), eq(mutedUsers.mutedId, mutedId))
    );
    return !!result;
  }

  async getMutedUsers(userId: string): Promise<User[]> {
    const muted = await db.select().from(mutedUsers).where(eq(mutedUsers.muterId, userId));
    const userIds = muted.map(m => m.mutedId);
    if (userIds.length === 0) return [];
    return db.select().from(users).where(sql`${users.id} = ANY(${userIds})`);
  }

  // ============ EMAIL LOGS ============

  async createEmailLog(data: InsertEmailLog): Promise<EmailLog> {
    const [log] = await db.insert(emailLogs).values(data).returning();
    return log;
  }

  async getRecentEmailLogs(minutes: number): Promise<EmailLog[]> {
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    return db.select().from(emailLogs)
      .where(sql`${emailLogs.createdAt} >= ${cutoff}`)
      .orderBy(desc(emailLogs.createdAt));
  }

  async getEmailLogCount(minutes: number): Promise<number> {
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    const [result] = await db.select({ count: count() }).from(emailLogs)
      .where(sql`${emailLogs.createdAt} >= ${cutoff}`);
    return result?.count || 0;
  }

  // Splash Screen methods
  async getSplashScreen(): Promise<SplashScreen | undefined> {
    const result = await db.select().from(splashScreen).limit(1);
    return result[0];
  }

  async updateSplashScreen(userId: string, data: Partial<InsertSplashScreen>): Promise<SplashScreen> {
    const existingScreen = await this.getSplashScreen();
    if (existingScreen) {
      const updated = await db
        .update(splashScreen)
        .set({
          ...data,
          updatedAt: new Date(),
          updatedBy: userId,
        })
        .where(eq(splashScreen.id, existingScreen.id))
        .returning();
      return updated[0];
    } else {
      const created = await db
        .insert(splashScreen)
        .values({
          ...data,
          updatedBy: userId,
        })
        .returning();
      return created[0];
    }
  }

  // User Wallet methods (BEP-20 USDT)
  async getUserWallet(userId: string): Promise<any | undefined> {
    const result = await db.select().from(userWallets).where(eq(userWallets.userId, userId));
    return result[0];
  }

  async createUserWallet(data: any): Promise<any> {
    const result = await db.insert(userWallets).values(data).returning();
    return result[0];
  }

  async updateUserWallet(walletId: string, data: Partial<any>): Promise<any> {
    const result = await db
      .update(userWallets)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(userWallets.id, walletId))
      .returning();
    return result[0];
  }

  // Payment Wallets
  async addPaymentWallet(address: string, seedPhrase: string, paymentLink: string) {
    const result = await db.insert(paymentWallets).values({
      address, seedPhrase, paymentLink, status: 'idle',
    }).returning();
    return result[0];
  }

  async getAllPaymentWallets() {
    return await db.select().from(paymentWallets).leftJoin(users, eq(paymentWallets.assignedToUserId, users.id));
  }

  async assignPaymentWallet(userId: string) {
    const now = new Date();
    const expiry = new Date(now.getTime() + 20 * 60000);
    const idle = await db.select().from(paymentWallets).where(eq(paymentWallets.status, 'idle')).limit(1);
    if (idle.length === 0) throw new Error('No available payment wallets');
    const updated = await db.update(paymentWallets).set({
      status: 'in_use', assignedToUserId: userId, assignedAt: now, expiresAt: expiry,
    }).where(eq(paymentWallets.id, idle[0].id)).returning();
    return updated[0];
  }

  async createPaymentSession(userId: string, walletId: string, requestedAmount: number, expectedUsdtAmount: number) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 20 * 60000);
    const result = await db.insert(paymentSessions).values({
      userId, walletId, requestedAmount, expectedUsdtAmount, status: 'pending', expiresAt,
    }).returning();
    return result[0];
  }

  async recordPaymentWalletIncoming(walletId: string, amount: number, txHash: string) {
    try {
      const payment = await db.query.paymentWallets.findFirst({
        where: (w) => eq(w.id, walletId)
      });

      console.log(`[Storage] Recording payment - Wallet: ${walletId}, Amount: ${amount}, Payment found: ${!!payment}`);

      if (payment && payment.assignedToUserId) {
        await db.update(paymentWallets).set({
          lastIncomingAmount: amount,
          lastTransactionHash: txHash,
          totalProcessed: (payment.totalProcessed || 0) + amount,
          updatedAt: new Date(),
        }).where(eq(paymentWallets.id, walletId));

        const sessions = await db.select().from(paymentSessions)
          .where(and(eq(paymentSessions.walletId, walletId), or(eq(paymentSessions.status, "pending"), eq(paymentSessions.status, "received"))));

        console.log(`[Storage] Found ${sessions.length} pending sessions for wallet ${walletId}`);

        if (sessions.length > 0) {
          const session = sessions[0];
          await db.update(paymentSessions).set({
            receivedUsdtAmount: amount,
            transactionHash: txHash,
            status: "completed",
            completedAt: new Date(),
          }).where(eq(paymentSessions.id, session.id));

          console.log(`[Storage] Payment received: ${amount} USDT for user ${session.userId}`);
          
          // Import and trigger auto-forward to user's personal wallet
          try {
            const { paymentWalletsService } = await import('./payment-wallets-service');
            const result = await paymentWalletsService.forwardToPersonalWallet(session.userId, amount, walletId, session.id);
            console.log(`[Storage] Forward result:`, result);
          } catch (forwardError) {
            console.error(`[Storage] Auto-forward failed:`, forwardError);
          }
        } else {
          console.warn(`[Storage] No pending sessions found for wallet ${walletId}`);
        }
      } else {
        console.warn(`[Storage] Payment not found or not assigned to user. Wallet: ${walletId}`);
      }
    } catch (error) {
      console.error(`[Storage] Error in recordPaymentWalletIncoming:`, error);
    }
  }

  async getPaymentSessionByWallet(walletId: string) {
    const session = await db.select().from(paymentSessions)
      .where(and(eq(paymentSessions.walletId, walletId), eq(paymentSessions.status, "received")))
      .limit(1);
    return session.length > 0 ? session[0] : null;
  }

  async getSliderBannerSettings() {
    const { sliderBanner } = await import("@shared/schema");
    const [settings] = await db.select().from(sliderBanner).limit(1);
    if (!settings) {
      const [created] = await db.insert(sliderBanner).values({}).returning();
      return created;
    }
    return settings;
  }

  async updateSliderBannerSettings(data: { refreshIntervalHours?: number; lastRefreshedAt?: Date }) {
    const { sliderBanner } = await import("@shared/schema");
    const settings = await this.getSliderBannerSettings();
    const [updated] = await db.update(sliderBanner)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(sliderBanner.id, settings.id))
      .returning();
    return updated;
  }

  async getSliderBannerItems() {
    const { sliderBannerItems } = await import("@shared/schema");
    return db.select().from(sliderBannerItems).orderBy(sliderBannerItems.sortOrder);
  }

  async getTrendingProducts(excludeIds: string[], limit: number) {
    const allProducts = await db.select().from(products).orderBy(desc(products.viewCount));
    return allProducts
      .filter(p => !excludeIds.includes(p.id))
      .slice(0, limit);
  }

  async getSliderBannerProducts(limit: number) {
    const { sliderBannerItems } = await import("@shared/schema");
    const items = await db.select().from(sliderBannerItems).orderBy(sliderBannerItems.sortOrder);
    const pinnedIds = items.filter(i => i.isPinned && !i.isExcluded).map(i => i.productId);
    const excludedIds = items.filter(i => i.isExcluded).map(i => i.productId);

    const pinnedProducts: any[] = [];
    for (const pid of pinnedIds) {
      const p = await this.getProductById(pid);
      if (p) pinnedProducts.push(p);
    }

    const remaining = limit - pinnedProducts.length;
    let trendingProducts: any[] = [];
    if (remaining > 0) {
      trendingProducts = await this.getTrendingProducts([...pinnedIds, ...excludedIds], remaining);
    }

    return [...pinnedProducts, ...trendingProducts];
  }

  async pinSliderProduct(productId: string, sortOrder: number = 0) {
    const { sliderBannerItems } = await import("@shared/schema");
    const existing = await db.select().from(sliderBannerItems).where(eq(sliderBannerItems.productId, productId)).limit(1);
    if (existing.length > 0) {
      const [updated] = await db.update(sliderBannerItems)
        .set({ isPinned: true, isExcluded: false, sortOrder })
        .where(eq(sliderBannerItems.productId, productId))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(sliderBannerItems)
        .values({ productId, isPinned: true, isExcluded: false, sortOrder })
        .returning();
      return created;
    }
  }

  async excludeSliderProduct(productId: string) {
    const { sliderBannerItems } = await import("@shared/schema");
    const existing = await db.select().from(sliderBannerItems).where(eq(sliderBannerItems.productId, productId)).limit(1);
    if (existing.length > 0) {
      const [updated] = await db.update(sliderBannerItems)
        .set({ isPinned: false, isExcluded: true })
        .where(eq(sliderBannerItems.productId, productId))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(sliderBannerItems)
        .values({ productId, isPinned: false, isExcluded: true, sortOrder: 0 })
        .returning();
      return created;
    }
  }

  async removeSliderOverride(productId: string) {
    const { sliderBannerItems } = await import("@shared/schema");
    const result = await db.delete(sliderBannerItems).where(eq(sliderBannerItems.productId, productId));
    return true;
  }
}

export const storage = new DatabaseStorage();
