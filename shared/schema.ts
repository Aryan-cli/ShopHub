import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, timestamp, boolean, real } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ============ BITCOIN ESCROW SYSTEM ============

// Virtual wallets for merchants (BTC, BNB, and USDT balance tracking)
export const virtualWallets = pgTable("virtual_wallets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  availableBalance: real("available_balance").notNull().default(0), // BTC that can be withdrawn
  pendingBalance: real("pending_balance").notNull().default(0), // BTC in escrow
  totalEarned: real("total_earned").notNull().default(0), // Lifetime BTC earnings
  bnbAvailableBalance: real("bnb_available_balance").notNull().default(0), // BNB that can be withdrawn
  bnbPendingBalance: real("bnb_pending_balance").notNull().default(0), // BNB in escrow
  bnbTotalEarned: real("bnb_total_earned").notNull().default(0), // Lifetime BNB earnings
  usdtAvailableBalance: real("usdt_available_balance").notNull().default(0), // USDT that can be withdrawn
  usdtPendingBalance: real("usdt_pending_balance").notNull().default(0), // USDT in escrow
  usdtTotalEarned: real("usdt_total_earned").notNull().default(0), // Lifetime USDT earnings
  derivationIndex: integer("derivation_index").notNull().default(0), // HD wallet derivation index for this merchant
  btcAddress: text("btc_address"), // Merchant's main BTC receiving address
  bnbAddress: text("bnb_address"), // Merchant's main BNB receiving address
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const virtualWalletsRelations = relations(virtualWallets, ({ one }) => ({
  user: one(users, {
    fields: [virtualWallets.userId],
    references: [users.id],
  }),
}));

// Escrow orders - the main payment tracking
export const escrowOrders = pgTable("escrow_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  buyerId: varchar("buyer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  merchantId: varchar("merchant_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  coinSymbol: text("coin_symbol").notNull().default("BTC"), // BTC, BNB, etc.
  cryptoAmount: real("crypto_amount").notNull(), // Amount in crypto
  btcAmount: real("btc_amount").notNull(), // Legacy field - Amount in BTC
  usdAmount: decimal("usd_amount", { precision: 10, scale: 2 }).notNull(), // Original USD amount
  depositAddress: text("deposit_address").notNull(), // Unique address for this payment
  status: text("status").notNull().default("pending_payment"), // pending_payment, escrow, confirmed, disputed, refunded, released, cancelled
  escrowStartedAt: timestamp("escrow_started_at"), // When payment was detected
  escrowExpiresAt: timestamp("escrow_expires_at"), // 24 hours after escrow starts
  confirmedAt: timestamp("confirmed_at"), // When buyer confirmed
  releasedAt: timestamp("released_at"), // When funds released to merchant
  refundedAt: timestamp("refunded_at"), // When buyer refunded
  refundConfirmedAt: timestamp("refund_confirmed_at"), // When refund was confirmed by admin (displays for 24 hours then disappears)
  cancelledAt: timestamp("cancelled_at"), // When payment was cancelled
  buyerRefundAddress: text("buyer_refund_address"), // Buyer's address for refund
  transactionHash: text("transaction_hash"), // Incoming transaction
  paymentMethod: text("payment_method").notNull().default("manual"), // wallet or manual payment method
  earlyApprovalEnabled: boolean("early_approval_enabled").notNull().default(false), // Admin can enable early approval
  feePercent: real("fee_percent").notNull().default(0), // Fee percentage applied to this order
  feeAmount: real("fee_amount").notNull().default(0), // Fee amount in crypto
  merchantAmount: real("merchant_amount").notNull().default(0), // Amount merchant receives after fee
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const escrowOrdersRelations = relations(escrowOrders, ({ one, many }) => ({
  order: one(orders, {
    fields: [escrowOrders.orderId],
    references: [orders.id],
  }),
  buyer: one(users, {
    fields: [escrowOrders.buyerId],
    references: [users.id],
    relationName: "escrowBuyer",
  }),
  merchant: one(users, {
    fields: [escrowOrders.merchantId],
    references: [users.id],
    relationName: "escrowMerchant",
  }),
  disputes: many(disputes),
  ledgerEntries: many(ledgerEntries),
}));

// Disputes raised by buyers
export const disputes = pgTable("disputes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  escrowOrderId: varchar("escrow_order_id").notNull().references(() => escrowOrders.id, { onDelete: "cascade" }),
  buyerId: varchar("buyer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  merchantId: varchar("merchant_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  evidenceDescription: text("evidence_description"),
  evidenceImageData: text("evidence_image_data"),
  evidenceImageType: text("evidence_image_type"),
  status: text("status").notNull().default("open"), // open, resolved_refund, resolved_release
  adminNotes: text("admin_notes"),
  resolvedBy: varchar("resolved_by").references(() => users.id),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const disputesRelations = relations(disputes, ({ one }) => ({
  escrowOrder: one(escrowOrders, {
    fields: [disputes.escrowOrderId],
    references: [escrowOrders.id],
  }),
  buyer: one(users, {
    fields: [disputes.buyerId],
    references: [users.id],
    relationName: "disputeBuyer",
  }),
  merchant: one(users, {
    fields: [disputes.merchantId],
    references: [users.id],
    relationName: "disputeMerchant",
  }),
  admin: one(users, {
    fields: [disputes.resolvedBy],
    references: [users.id],
    relationName: "disputeAdmin",
  }),
}));

// Withdrawal requests from merchants
export const withdrawalRequests = pgTable("withdrawal_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: varchar("merchant_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  coinSymbol: text("coin_symbol").notNull().default("BTC"), // BTC, BNB, or USDT
  btcAmount: real("btc_amount").notNull().default(0), // BTC amount (legacy, also used for amount)
  bnbAmount: real("bnb_amount").notNull().default(0), // BNB amount
  usdtAmount: real("usdt_amount").notNull().default(0), // USDT amount
  btcAddress: text("btc_address"), // Merchant's external BTC wallet
  bnbAddress: text("bnb_address"), // Merchant's external BNB wallet
  usdtAddress: text("usdt_address"), // Merchant's external USDT wallet (BSC network)
  status: text("status").notNull().default("pending"), // pending, approved, rejected, completed
  adminNotes: text("admin_notes"),
  approvedBy: varchar("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  transactionHash: text("transaction_hash"), // Outgoing transaction
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const withdrawalRequestsRelations = relations(withdrawalRequests, ({ one }) => ({
  merchant: one(users, {
    fields: [withdrawalRequests.merchantId],
    references: [users.id],
    relationName: "withdrawalMerchant",
  }),
  admin: one(users, {
    fields: [withdrawalRequests.approvedBy],
    references: [users.id],
    relationName: "withdrawalAdmin",
  }),
}));

// Ledger entries - audit trail for all balance changes
export const ledgerEntries = pgTable("ledger_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  escrowOrderId: varchar("escrow_order_id").references(() => escrowOrders.id),
  withdrawalId: varchar("withdrawal_id").references(() => withdrawalRequests.id),
  type: text("type").notNull(), // escrow_received, escrow_released, escrow_refunded, withdrawal_pending, withdrawal_completed
  btcAmount: real("btc_amount").notNull(),
  balanceAfter: real("balance_after").notNull(),
  description: text("description").notNull(),
  transactionHash: text("transaction_hash"), // Track transaction hash used in this ledger entry
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const ledgerEntriesRelations = relations(ledgerEntries, ({ one }) => ({
  user: one(users, {
    fields: [ledgerEntries.userId],
    references: [users.id],
  }),
  escrowOrder: one(escrowOrders, {
    fields: [ledgerEntries.escrowOrderId],
    references: [escrowOrders.id],
  }),
  withdrawal: one(withdrawalRequests, {
    fields: [ledgerEntries.withdrawalId],
    references: [withdrawalRequests.id],
  }),
}));

// ============ PAYMENT COINS (Multi-Crypto Support) ============

export const paymentCoins = pgTable("payment_coins", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  symbol: text("symbol").notNull().unique(), // BTC, BNB, etc.
  name: text("name").notNull(), // Bitcoin, BNB Smart Chain, etc.
  network: text("network").notNull(), // mainnet, bsc, etc.
  isEnabled: boolean("is_enabled").notNull().default(true),
  rpcUrl: text("rpc_url"), // For non-BTC chains
  explorerUrl: text("explorer_url"), // Block explorer URL
  addressPrefix: text("address_prefix"), // For address validation
  decimals: integer("decimals").notNull().default(8),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPaymentCoinSchema = createInsertSchema(paymentCoins).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type PaymentCoin = typeof paymentCoins.$inferSelect;
export type InsertPaymentCoin = z.infer<typeof insertPaymentCoinSchema>;

// ============ ADMIN SETTINGS ============

export const adminSettings = pgTable("admin_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  description: text("description"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  updatedBy: varchar("updated_by").references(() => users.id),
});

export const insertAdminSettingSchema = createInsertSchema(adminSettings).omit({
  id: true,
  updatedAt: true,
});

export type AdminSetting = typeof adminSettings.$inferSelect;
export type InsertAdminSetting = z.infer<typeof insertAdminSettingSchema>;

// ============ ADMIN WALLET (For Fee Collection) ============

export const adminWallet = pgTable("admin_wallet", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  btcBalance: real("btc_balance").notNull().default(0),
  bnbBalance: real("bnb_balance").notNull().default(0),
  usdtBalance: real("usdt_balance").notNull().default(0),
  totalBtcEarned: real("total_btc_earned").notNull().default(0),
  totalBnbEarned: real("total_bnb_earned").notNull().default(0),
  totalUsdtEarned: real("total_usdt_earned").notNull().default(0),
  btcWithdrawalAddress: text("btc_withdrawal_address"),
  bnbWithdrawalAddress: text("bnb_withdrawal_address"),
  usdtWithdrawalAddress: text("usdt_withdrawal_address"),
  autoTransferFees: boolean("auto_transfer_fees").notNull().default(false),
  adminSeed: text("admin_seed"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ============ PRODUCT FEES (Per-Product Fee Override) ============

export const productFees = pgTable("product_fees", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  productId: varchar("product_id").notNull().references(() => products.id, { onDelete: "cascade" }).unique(),
  feePercent: real("fee_percent").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedBy: varchar("updated_by").references(() => users.id),
});

export const productFeesRelations = relations(productFees, ({ one }) => ({
  product: one(products, {
    fields: [productFees.productId],
    references: [products.id],
  }),
}));

// ============ ADMIN WITHDRAWAL REQUESTS ============

export const adminWithdrawalRequests = pgTable("admin_withdrawal_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  coinSymbol: text("coin_symbol").notNull().default("BTC"),
  amount: real("amount").notNull(),
  toAddress: text("to_address").notNull(),
  status: text("status").notNull().default("pending"),
  transactionHash: text("transaction_hash"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ============ END BITCOIN ESCROW SYSTEM ============

// ============ SPLASH SCREEN ============

export const splashScreen = pgTable("splash_screen", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  htmlContent: text("html_content").notNull().default("<div>Welcome</div>"),
  isEnabled: boolean("is_enabled").notNull().default(true),
  displayDuration: integer("display_duration").notNull().default(3000), // milliseconds
  useLoadingMode: boolean("use_loading_mode").notNull().default(false), // Wait for page load instead of timer
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  updatedBy: varchar("updated_by").references(() => users.id),
});

export const insertSplashScreenSchema = createInsertSchema(splashScreen).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type SplashScreen = typeof splashScreen.$inferSelect;
export type InsertSplashScreen = z.infer<typeof insertSplashScreenSchema>;

// ============ END SPLASH SCREEN ============

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  isAdmin: boolean("is_admin").notNull().default(false),
  isMerchant: boolean("is_merchant").notNull().default(false),
  merchantSince: timestamp("merchant_since"),
  bio: text("bio"),
  avatarData: text("avatar_data"),
  avatarType: text("avatar_type"),
  isBlocked: boolean("is_blocked").notNull().default(false),
  registrationIp: text("registration_ip"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  reviews: many(reviews),
  products: many(products),
  favorites: many(favorites),
  orders: many(orders),
  followers: many(merchantFollowers, { relationName: "followers" }),
  following: many(merchantFollowers, { relationName: "following" }),
  forumPosts: many(forumPosts),
}));

export const products = pgTable("products", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  imageData: text("image_data"),
  imageType: text("image_type"),
  images: text("images").array(), // Multiple product images as array
  afterBuyMessage: text("after_buy_message").notNull().default("Thank you for your purchase!"), // Required message shown after purchase
  afterBuyButtonLabel: text("after_buy_button_label"), // Optional CTA button label
  afterBuyButtonUrl: text("after_buy_button_url"), // Optional CTA button URL
  merchantId: varchar("merchant_id").references(() => users.id, { onDelete: "cascade" }),
  stockQuantity: integer("stock_quantity"), // null = unlimited stock
  viewCount: integer("view_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const productsRelations = relations(products, ({ one, many }) => ({
  reviews: many(reviews),
  merchant: one(users, {
    fields: [products.merchantId],
    references: [users.id],
  }),
  favorites: many(favorites),
  orderItems: many(orderItems),
}));

export const reviews = pgTable("reviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  productId: varchar("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  username: text("username").notNull(),
  rating: integer("rating"),
  comment: text("comment").notNull(),
  isVerifiedBuyer: boolean("is_verified_buyer").notNull().default(false),
  isMerchantReply: boolean("is_merchant_reply").notNull().default(false),
  parentReviewId: varchar("parent_review_id").references(() => reviews.id, { onDelete: "cascade" }),
  isEdited: boolean("is_edited").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Explicitly define relations to avoid circular type inference issues
export const reviewsRelations = relations(reviews, ({ one, many }) => ({
  product: one(products, {
    fields: [reviews.productId],
    references: [products.id],
  }),
  user: one(users, {
    fields: [reviews.userId],
    references: [users.id],
  }),
  parentReview: one(reviews, {
    fields: [reviews.parentReviewId],
    references: [reviews.id],
    relationName: "replies",
  }),
  replies: many(reviews, { relationName: "replies" }),
}));

export const favorites = pgTable("favorites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  productId: varchar("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const favoritesRelations = relations(favorites, ({ one }) => ({
  user: one(users, {
    fields: [favorites.userId],
    references: [users.id],
  }),
  product: one(products, {
    fields: [favorites.productId],
    references: [products.id],
  }),
}));

export const merchantFollowers = pgTable("merchant_followers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: varchar("merchant_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  followerId: varchar("follower_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const merchantFollowersRelations = relations(merchantFollowers, ({ one }) => ({
  merchant: one(users, {
    fields: [merchantFollowers.merchantId],
    references: [users.id],
    relationName: "followers",
  }),
  follower: one(users, {
    fields: [merchantFollowers.followerId],
    references: [users.id],
    relationName: "following",
  }),
}));

export const orders = pgTable("orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("completed"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, {
    fields: [orders.userId],
    references: [users.id],
  }),
  items: many(orderItems),
}));

export const orderItems = pgTable("order_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  productId: varchar("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  quantity: integer("quantity").notNull().default(1),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
});

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
}));

export const conversations = pgTable("conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const conversationsRelations = relations(conversations, ({ many }) => ({
  participants: many(conversationParticipants),
  messages: many(messages),
}));

export const conversationParticipants = pgTable("conversation_participants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
});

export const conversationParticipantsRelations = relations(conversationParticipants, ({ one }) => ({
  conversation: one(conversations, {
    fields: [conversationParticipants.conversationId],
    references: [conversations.id],
  }),
  user: one(users, {
    fields: [conversationParticipants.userId],
    references: [users.id],
  }),
}));

export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  senderId: varchar("sender_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  content: text("content"),
  contentType: text("content_type").notNull().default("text"),
  attachmentData: text("attachment_data"),
  attachmentType: text("attachment_type"),
  isEdited: boolean("is_edited").notNull().default(false),
  isDeleted: boolean("is_deleted").notNull().default(false),
  parentMessageId: varchar("parent_message_id"),
  replyToContent: text("reply_to_content"),
  replyToUsername: text("reply_to_username"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  editedAt: timestamp("edited_at"),
});

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  sender: one(users, {
    fields: [messages.senderId],
    references: [users.id],
  }),
}));

export const friendRequests = pgTable("friend_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  senderId: varchar("sender_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  receiverId: varchar("receiver_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const friendRequestsRelations = relations(friendRequests, ({ one }) => ({
  sender: one(users, {
    fields: [friendRequests.senderId],
    references: [users.id],
  }),
  receiver: one(users, {
    fields: [friendRequests.receiverId],
    references: [users.id],
  }),
}));

export const friends = pgTable("friends", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  friendId: varchar("friend_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const friendsRelations = relations(friends, ({ one }) => ({
  user: one(users, {
    fields: [friends.userId],
    references: [users.id],
  }),
  friend: one(users, {
    fields: [friends.friendId],
    references: [users.id],
  }),
}));

export const userBlocks = pgTable("user_blocks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  blockerId: varchar("blocker_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  blockedId: varchar("blocked_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const userBlocksRelations = relations(userBlocks, ({ one }) => ({
  blocker: one(users, {
    fields: [userBlocks.blockerId],
    references: [users.id],
  }),
  blocked: one(users, {
    fields: [userBlocks.blockedId],
    references: [users.id],
  }),
}));

export const forumPosts = pgTable("forum_posts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  imageData: text("image_data"),
  imageType: text("image_type"),
  likeCount: integer("like_count").notNull().default(0),
  commentCount: integer("comment_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const forumPostsRelations = relations(forumPosts, ({ one, many }) => ({
  user: one(users, {
    fields: [forumPosts.userId],
    references: [users.id],
  }),
  likes: many(forumLikes),
  comments: many(forumComments),
}));

export const forumLikes = pgTable("forum_likes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  postId: varchar("post_id").notNull().references(() => forumPosts.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const forumLikesRelations = relations(forumLikes, ({ one }) => ({
  post: one(forumPosts, {
    fields: [forumLikes.postId],
    references: [forumPosts.id],
  }),
  user: one(users, {
    fields: [forumLikes.userId],
    references: [users.id],
  }),
}));

export const forumComments = pgTable("forum_comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  postId: varchar("post_id").notNull().references(() => forumPosts.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const forumCommentsRelations = relations(forumComments, ({ one }) => ({
  post: one(forumPosts, {
    fields: [forumComments.postId],
    references: [forumPosts.id],
  }),
  user: one(users, {
    fields: [forumComments.userId],
    references: [users.id],
  }),
}));

// ============ PURCHASE SNAPSHOTS ============
// Stores product details at time of purchase so buyer can view even if product is removed

export const purchaseSnapshots = pgTable("purchase_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  escrowOrderId: varchar("escrow_order_id").notNull().references(() => escrowOrders.id, { onDelete: "cascade" }).unique(),
  productName: text("product_name").notNull(),
  productDescription: text("product_description").notNull(),
  productImages: text("product_images").array(),
  afterBuyMessage: text("after_buy_message"),
  afterBuyButtonLabel: text("after_buy_button_label"),
  afterBuyButtonUrl: text("after_buy_button_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const purchaseSnapshotsRelations = relations(purchaseSnapshots, ({ one }) => ({
  escrowOrder: one(escrowOrders, {
    fields: [purchaseSnapshots.escrowOrderId],
    references: [escrowOrders.id],
  }),
}));

export const insertPurchaseSnapshotSchema = createInsertSchema(purchaseSnapshots).omit({
  id: true,
  createdAt: true,
});

export type InsertPurchaseSnapshot = z.infer<typeof insertPurchaseSnapshotSchema>;
export type PurchaseSnapshot = typeof purchaseSnapshots.$inferSelect;

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const registerUserSchema = insertUserSchema.extend({
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  viewCount: true,
  createdAt: true,
});

export const insertReviewSchema = createInsertSchema(reviews).omit({
  id: true,
  createdAt: true,
  username: true,
  isVerifiedBuyer: true,
  isMerchantReply: true,
});

export const insertFavoriteSchema = createInsertSchema(favorites).omit({
  id: true,
  createdAt: true,
});

export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
  createdAt: true,
  status: true,
});

export const insertOrderItemSchema = createInsertSchema(orderItems).omit({
  id: true,
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
  isEdited: true,
  isDeleted: true,
  editedAt: true,
});

export const insertForumPostSchema = createInsertSchema(forumPosts).omit({
  id: true,
  createdAt: true,
  likeCount: true,
  commentCount: true,
});

export const insertForumCommentSchema = createInsertSchema(forumComments).omit({
  id: true,
  createdAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;
export type InsertReview = z.infer<typeof insertReviewSchema>;
export type Review = typeof reviews.$inferSelect;
export type InsertFavorite = z.infer<typeof insertFavoriteSchema>;
export type Favorite = typeof favorites.$inferSelect;
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;
export type OrderItem = typeof orderItems.$inferSelect;
export type MerchantFollower = typeof merchantFollowers.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type ConversationParticipant = typeof conversationParticipants.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;
export type FriendRequest = typeof friendRequests.$inferSelect;
export type Friend = typeof friends.$inferSelect;
export type UserBlock = typeof userBlocks.$inferSelect;
export type InsertForumPost = z.infer<typeof insertForumPostSchema>;
export type ForumPost = typeof forumPosts.$inferSelect;
export type ForumLike = typeof forumLikes.$inferSelect;
export type InsertForumComment = z.infer<typeof insertForumCommentSchema>;
export type ForumComment = typeof forumComments.$inferSelect;

// ============ ESCROW SYSTEM SCHEMAS & TYPES ============

export const insertVirtualWalletSchema = createInsertSchema(virtualWallets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertEscrowOrderSchema = createInsertSchema(escrowOrders).omit({
  id: true,
  status: true,
  escrowStartedAt: true,
  escrowExpiresAt: true,
  confirmedAt: true,
  releasedAt: true,
  refundedAt: true,
  transactionHash: true,
  createdAt: true,
});

export const insertDisputeSchema = createInsertSchema(disputes).omit({
  id: true,
  status: true,
  adminNotes: true,
  resolvedBy: true,
  resolvedAt: true,
  createdAt: true,
});

export const insertWithdrawalRequestSchema = createInsertSchema(withdrawalRequests).omit({
  id: true,
  status: true,
  adminNotes: true,
  approvedBy: true,
  approvedAt: true,
  transactionHash: true,
  completedAt: true,
  createdAt: true,
});

export const insertLedgerEntrySchema = createInsertSchema(ledgerEntries).omit({
  id: true,
  createdAt: true,
});

export type VirtualWallet = typeof virtualWallets.$inferSelect;
export type InsertVirtualWallet = z.infer<typeof insertVirtualWalletSchema>;
export type EscrowOrder = typeof escrowOrders.$inferSelect;
export type InsertEscrowOrder = z.infer<typeof insertEscrowOrderSchema>;
export type Dispute = typeof disputes.$inferSelect;
export type InsertDispute = z.infer<typeof insertDisputeSchema>;
export type WithdrawalRequest = typeof withdrawalRequests.$inferSelect;
export type InsertWithdrawalRequest = z.infer<typeof insertWithdrawalRequestSchema>;
export type LedgerEntry = typeof ledgerEntries.$inferSelect;
export type InsertLedgerEntry = z.infer<typeof insertLedgerEntrySchema>;

// ============ USER WALLETS (BEP-20 USDT) ============

export const userWallets = pgTable("user_wallets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  seed: text("seed").notNull(), // Encrypted seed phrase (server manages)
  address: text("address").notNull(), // Wallet address on BEP-20
  usdtBalance: real("usdt_balance").notNull().default(0), // USDT balance in wallet
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const userWalletsRelations = relations(userWallets, ({ one }) => ({
  user: one(users, {
    fields: [userWallets.userId],
    references: [users.id],
  }),
}));

export const insertUserWalletSchema = createInsertSchema(userWallets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type UserWallet = typeof userWallets.$inferSelect;
export type InsertUserWallet = z.infer<typeof insertUserWalletSchema>;

// ============ NOTIFICATION SYSTEM ============

export const notificationSettings = pgTable("notification_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  email: text("email"),
  notificationsEnabled: boolean("notifications_enabled").notNull().default(false),
  chatNotifications: boolean("chat_notifications").notNull().default(true),
  purchaseNotifications: boolean("purchase_notifications").notNull().default(true),
  saleNotifications: boolean("sale_notifications").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const notificationSettingsRelations = relations(notificationSettings, ({ one }) => ({
  user: one(users, {
    fields: [notificationSettings.userId],
    references: [users.id],
  }),
}));

export const mutedUsers = pgTable("muted_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  muterId: varchar("muter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  mutedId: varchar("muted_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const mutedUsersRelations = relations(mutedUsers, ({ one }) => ({
  muter: one(users, {
    fields: [mutedUsers.muterId],
    references: [users.id],
  }),
  muted: one(users, {
    fields: [mutedUsers.mutedId],
    references: [users.id],
  }),
}));

export const insertNotificationSettingsSchema = createInsertSchema(notificationSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type NotificationSettings = typeof notificationSettings.$inferSelect;
export type InsertNotificationSettings = z.infer<typeof insertNotificationSettingsSchema>;
export type MutedUser = typeof mutedUsers.$inferSelect;

// ============ EMAIL LOGS ============

export const emailLogs = pgTable("email_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  recipientEmail: text("recipient_email").notNull(),
  recipientUserId: varchar("recipient_user_id").references(() => users.id, { onDelete: "set null" }),
  emailType: text("email_type").notNull(), // chat, purchase, sale
  subject: text("subject").notNull(),
  status: text("status").notNull().default("sent"), // sent, failed
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const emailLogsRelations = relations(emailLogs, ({ one }) => ({
  recipient: one(users, {
    fields: [emailLogs.recipientUserId],
    references: [users.id],
  }),
}));

export const insertEmailLogSchema = createInsertSchema(emailLogs).omit({
  id: true,
  createdAt: true,
});

export type EmailLog = typeof emailLogs.$inferSelect;
export type InsertEmailLog = z.infer<typeof insertEmailLogSchema>;

// ============ PAYMENT WALLETS (FOR RAMP INTEGRATION) ============

export const paymentWallets = pgTable("payment_wallets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  address: text("address").notNull().unique(), // Wallet address (BSC)
  seedPhrase: text("seed_phrase").notNull(), // Encrypted seed phrase
  paymentLink: text("payment_link").notNull(), // Ramp payment link for this wallet
  status: text("status").notNull().default("idle"), // idle, in_use
  assignedToUserId: varchar("assigned_to_user_id").references(() => users.id, { onDelete: "set null" }), // Current user using this wallet
  assignedAt: timestamp("assigned_at"), // When wallet was assigned
  expiresAt: timestamp("expires_at"), // 20-minute expiry for this assignment
  lastIncomingAmount: real("last_incoming_amount").default(0), // Track received USDT amount
  lastTransactionHash: text("last_transaction_hash"), // Incoming transaction hash
  totalProcessed: real("total_processed").default(0), // Lifetime USDT processed
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const paymentWalletsRelations = relations(paymentWallets, ({ one }) => ({
  assignedUser: one(users, {
    fields: [paymentWallets.assignedToUserId],
    references: [users.id],
  }),
}));

export const paymentSessions = pgTable("payment_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  walletId: varchar("wallet_id").notNull().references(() => paymentWallets.id, { onDelete: "cascade" }),
  requestedAmount: real("requested_amount").notNull(), // Amount user requested in INR
  expectedUsdtAmount: real("expected_usdt_amount").notNull(), // Expected USDT to receive
  receivedUsdtAmount: real("received_usdt_amount").default(0), // Actual USDT received
  status: text("status").notNull().default("pending"), // pending, completed, expired, failed
  transactionHash: text("transaction_hash"), // Incoming transaction hash
  expiresAt: timestamp("expires_at").notNull(), // 20-minute expiry
  completedAt: timestamp("completed_at"), // When payment was completed
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const paymentSessionsRelations = relations(paymentSessions, ({ one }) => ({
  user: one(users, {
    fields: [paymentSessions.userId],
    references: [users.id],
  }),
  wallet: one(paymentWallets, {
    fields: [paymentSessions.walletId],
    references: [paymentWallets.id],
  }),
}));

export const insertPaymentWalletSchema = createInsertSchema(paymentWallets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPaymentSessionSchema = createInsertSchema(paymentSessions).omit({
  id: true,
  createdAt: true,
});

// ============ PRODUCT PAYMENT WALLETS (FOR PRODUCT PURCHASES) ============

export const productPaymentWallets = pgTable("product_payment_wallets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  address: text("address").notNull().unique(), // Wallet address (BSC)
  seedPhrase: text("seed_phrase").notNull(), // Encrypted seed phrase
  paymentLink: text("payment_link").notNull(), // Ramp payment link for this wallet
  status: text("status").notNull().default("idle"), // idle, in_use
  assignedToUserId: varchar("assigned_to_user_id").references(() => users.id, { onDelete: "set null" }), // Current user using this wallet
  assignedAt: timestamp("assigned_at"), // When wallet was assigned
  expiresAt: timestamp("expires_at"), // 20-minute expiry for this assignment
  lastIncomingAmount: real("last_incoming_amount").default(0), // Track received USDT amount
  lastTransactionHash: text("last_transaction_hash"), // Incoming transaction hash
  totalProcessed: real("total_processed").default(0), // Lifetime USDT processed
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const productPaymentWalletsRelations = relations(productPaymentWallets, ({ one }) => ({
  assignedUser: one(users, {
    fields: [productPaymentWallets.assignedToUserId],
    references: [users.id],
  }),
}));

export const insertProductPaymentWalletSchema = createInsertSchema(productPaymentWallets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type PaymentWallet = typeof paymentWallets.$inferSelect;
export type InsertPaymentWallet = z.infer<typeof insertPaymentWalletSchema>;
export type PaymentSession = typeof paymentSessions.$inferSelect;
export type InsertPaymentSession = z.infer<typeof insertPaymentSessionSchema>;

// ============ BANNER SLIDER ============

export const sliderBanner = pgTable("slider_banner", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  refreshIntervalHours: integer("refresh_interval_hours").notNull().default(24),
  lastRefreshedAt: timestamp("last_refreshed_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const sliderBannerItems = pgTable("slider_banner_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  productId: varchar("product_id").notNull().references(() => products.id, { onDelete: "cascade" }).unique(),
  isPinned: boolean("is_pinned").notNull().default(true),
  isExcluded: boolean("is_excluded").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  addedAt: timestamp("added_at").notNull().defaultNow(),
});

export const sliderBannerItemsRelations = relations(sliderBannerItems, ({ one }) => ({
  product: one(products, {
    fields: [sliderBannerItems.productId],
    references: [products.id],
  }),
}));

export const insertSliderBannerItemSchema = createInsertSchema(sliderBannerItems).omit({
  id: true,
  addedAt: true,
});

export type SliderBanner = typeof sliderBanner.$inferSelect;
export type SliderBannerItem = typeof sliderBannerItems.$inferSelect;
export type InsertSliderBannerItem = z.infer<typeof insertSliderBannerItemSchema>;

// ============ END BANNER SLIDER ============

export type ProductPaymentWallet = typeof productPaymentWallets.$inferSelect;
export type InsertProductPaymentWallet = z.infer<typeof insertProductPaymentWalletSchema>;
