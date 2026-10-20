CREATE TABLE "admin_settings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"description" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" varchar,
	CONSTRAINT "admin_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "admin_wallet" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"btc_balance" real DEFAULT 0 NOT NULL,
	"bnb_balance" real DEFAULT 0 NOT NULL,
	"usdt_balance" real DEFAULT 0 NOT NULL,
	"total_btc_earned" real DEFAULT 0 NOT NULL,
	"total_bnb_earned" real DEFAULT 0 NOT NULL,
	"total_usdt_earned" real DEFAULT 0 NOT NULL,
	"btc_withdrawal_address" text,
	"bnb_withdrawal_address" text,
	"usdt_withdrawal_address" text,
	"auto_transfer_fees" boolean DEFAULT false NOT NULL,
	"admin_seed" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_withdrawal_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coin_symbol" text DEFAULT 'BTC' NOT NULL,
	"amount" real NOT NULL,
	"to_address" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"transaction_hash" text,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_participants" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "disputes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"escrow_order_id" varchar NOT NULL,
	"buyer_id" varchar NOT NULL,
	"merchant_id" varchar NOT NULL,
	"reason" text NOT NULL,
	"evidence_description" text,
	"evidence_image_data" text,
	"evidence_image_type" text,
	"status" text DEFAULT 'open' NOT NULL,
	"admin_notes" text,
	"resolved_by" varchar,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_email" text NOT NULL,
	"recipient_user_id" varchar,
	"email_type" text NOT NULL,
	"subject" text NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "escrow_orders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" varchar NOT NULL,
	"buyer_id" varchar NOT NULL,
	"merchant_id" varchar NOT NULL,
	"coin_symbol" text DEFAULT 'BTC' NOT NULL,
	"crypto_amount" real NOT NULL,
	"btc_amount" real NOT NULL,
	"usd_amount" numeric(10, 2) NOT NULL,
	"deposit_address" text NOT NULL,
	"status" text DEFAULT 'pending_payment' NOT NULL,
	"escrow_started_at" timestamp,
	"escrow_expires_at" timestamp,
	"confirmed_at" timestamp,
	"released_at" timestamp,
	"refunded_at" timestamp,
	"refund_confirmed_at" timestamp,
	"cancelled_at" timestamp,
	"buyer_refund_address" text,
	"transaction_hash" text,
	"payment_method" text DEFAULT 'manual' NOT NULL,
	"early_approval_enabled" boolean DEFAULT false NOT NULL,
	"fee_percent" real DEFAULT 0 NOT NULL,
	"fee_amount" real DEFAULT 0 NOT NULL,
	"merchant_amount" real DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "favorites" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"product_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forum_comments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forum_likes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forum_posts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"content" text NOT NULL,
	"image_data" text,
	"image_type" text,
	"like_count" integer DEFAULT 0 NOT NULL,
	"comment_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "friend_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sender_id" varchar NOT NULL,
	"receiver_id" varchar NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "friends" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"friend_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"escrow_order_id" varchar,
	"withdrawal_id" varchar,
	"type" text NOT NULL,
	"btc_amount" real NOT NULL,
	"balance_after" real NOT NULL,
	"description" text NOT NULL,
	"transaction_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_followers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"follower_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" varchar NOT NULL,
	"sender_id" varchar NOT NULL,
	"content" text,
	"content_type" text DEFAULT 'text' NOT NULL,
	"attachment_data" text,
	"attachment_type" text,
	"is_edited" boolean DEFAULT false NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"parent_message_id" varchar,
	"reply_to_content" text,
	"reply_to_username" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"edited_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "muted_users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"muter_id" varchar NOT NULL,
	"muted_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_settings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"email" text,
	"notifications_enabled" boolean DEFAULT false NOT NULL,
	"chat_notifications" boolean DEFAULT true NOT NULL,
	"purchase_notifications" boolean DEFAULT true NOT NULL,
	"sale_notifications" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "notification_settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" varchar NOT NULL,
	"product_id" varchar NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"price" numeric(10, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"total_amount" numeric(10, 2) NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_coins" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" text NOT NULL,
	"name" text NOT NULL,
	"network" text NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"rpc_url" text,
	"explorer_url" text,
	"address_prefix" text,
	"decimals" integer DEFAULT 8 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payment_coins_symbol_unique" UNIQUE("symbol")
);
--> statement-breakpoint
CREATE TABLE "payment_sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"wallet_id" varchar NOT NULL,
	"requested_amount" real NOT NULL,
	"expected_usdt_amount" real NOT NULL,
	"received_usdt_amount" real DEFAULT 0,
	"status" text DEFAULT 'pending' NOT NULL,
	"transaction_hash" text,
	"expires_at" timestamp NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_wallets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"address" text NOT NULL,
	"seed_phrase" text NOT NULL,
	"payment_link" text NOT NULL,
	"status" text DEFAULT 'idle' NOT NULL,
	"assigned_to_user_id" varchar,
	"assigned_at" timestamp,
	"expires_at" timestamp,
	"last_incoming_amount" real DEFAULT 0,
	"last_transaction_hash" text,
	"total_processed" real DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payment_wallets_address_unique" UNIQUE("address")
);
--> statement-breakpoint
CREATE TABLE "product_fees" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" varchar NOT NULL,
	"fee_percent" real DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" varchar,
	CONSTRAINT "product_fees_product_id_unique" UNIQUE("product_id")
);
--> statement-breakpoint
CREATE TABLE "product_payment_wallets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"address" text NOT NULL,
	"seed_phrase" text NOT NULL,
	"payment_link" text NOT NULL,
	"status" text DEFAULT 'idle' NOT NULL,
	"assigned_to_user_id" varchar,
	"assigned_at" timestamp,
	"expires_at" timestamp,
	"last_incoming_amount" real DEFAULT 0,
	"last_transaction_hash" text,
	"total_processed" real DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "product_payment_wallets_address_unique" UNIQUE("address")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"image_data" text,
	"image_type" text,
	"images" text[],
	"after_buy_message" text DEFAULT 'Thank you for your purchase!' NOT NULL,
	"after_buy_button_label" text,
	"after_buy_button_url" text,
	"merchant_id" varchar,
	"stock_quantity" integer,
	"view_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_snapshots" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"escrow_order_id" varchar NOT NULL,
	"product_name" text NOT NULL,
	"product_description" text NOT NULL,
	"product_images" text[],
	"after_buy_message" text,
	"after_buy_button_label" text,
	"after_buy_button_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_snapshots_escrow_order_id_unique" UNIQUE("escrow_order_id")
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"username" text NOT NULL,
	"rating" integer,
	"comment" text NOT NULL,
	"is_verified_buyer" boolean DEFAULT false NOT NULL,
	"is_merchant_reply" boolean DEFAULT false NOT NULL,
	"parent_review_id" varchar,
	"is_edited" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slider_banner" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"refresh_interval_hours" integer DEFAULT 24 NOT NULL,
	"last_refreshed_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slider_banner_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" varchar NOT NULL,
	"is_pinned" boolean DEFAULT true NOT NULL,
	"is_excluded" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "slider_banner_items_product_id_unique" UNIQUE("product_id")
);
--> statement-breakpoint
CREATE TABLE "splash_screen" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"html_content" text DEFAULT '<div>Welcome</div>' NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"display_duration" integer DEFAULT 3000 NOT NULL,
	"use_loading_mode" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" varchar
);
--> statement-breakpoint
CREATE TABLE "user_blocks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blocker_id" varchar NOT NULL,
	"blocked_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_wallets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"seed" text NOT NULL,
	"address" text NOT NULL,
	"usdt_balance" real DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_wallets_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"is_merchant" boolean DEFAULT false NOT NULL,
	"merchant_since" timestamp,
	"bio" text,
	"avatar_data" text,
	"avatar_type" text,
	"is_blocked" boolean DEFAULT false NOT NULL,
	"registration_ip" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "virtual_wallets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"available_balance" real DEFAULT 0 NOT NULL,
	"pending_balance" real DEFAULT 0 NOT NULL,
	"total_earned" real DEFAULT 0 NOT NULL,
	"bnb_available_balance" real DEFAULT 0 NOT NULL,
	"bnb_pending_balance" real DEFAULT 0 NOT NULL,
	"bnb_total_earned" real DEFAULT 0 NOT NULL,
	"usdt_available_balance" real DEFAULT 0 NOT NULL,
	"usdt_pending_balance" real DEFAULT 0 NOT NULL,
	"usdt_total_earned" real DEFAULT 0 NOT NULL,
	"derivation_index" integer DEFAULT 0 NOT NULL,
	"btc_address" text,
	"bnb_address" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "virtual_wallets_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "withdrawal_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" varchar NOT NULL,
	"coin_symbol" text DEFAULT 'BTC' NOT NULL,
	"btc_amount" real DEFAULT 0 NOT NULL,
	"bnb_amount" real DEFAULT 0 NOT NULL,
	"usdt_amount" real DEFAULT 0 NOT NULL,
	"btc_address" text,
	"bnb_address" text,
	"usdt_address" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"admin_notes" text,
	"approved_by" varchar,
	"approved_at" timestamp,
	"transaction_hash" text,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_settings" ADD CONSTRAINT "admin_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_escrow_order_id_escrow_orders_id_fk" FOREIGN KEY ("escrow_order_id") REFERENCES "public"."escrow_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_merchant_id_users_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_orders" ADD CONSTRAINT "escrow_orders_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_orders" ADD CONSTRAINT "escrow_orders_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_orders" ADD CONSTRAINT "escrow_orders_merchant_id_users_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_comments" ADD CONSTRAINT "forum_comments_post_id_forum_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."forum_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_comments" ADD CONSTRAINT "forum_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_likes" ADD CONSTRAINT "forum_likes_post_id_forum_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."forum_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_likes" ADD CONSTRAINT "forum_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_posts" ADD CONSTRAINT "forum_posts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_receiver_id_users_id_fk" FOREIGN KEY ("receiver_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friends" ADD CONSTRAINT "friends_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friends" ADD CONSTRAINT "friends_friend_id_users_id_fk" FOREIGN KEY ("friend_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_escrow_order_id_escrow_orders_id_fk" FOREIGN KEY ("escrow_order_id") REFERENCES "public"."escrow_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_withdrawal_id_withdrawal_requests_id_fk" FOREIGN KEY ("withdrawal_id") REFERENCES "public"."withdrawal_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_followers" ADD CONSTRAINT "merchant_followers_merchant_id_users_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_followers" ADD CONSTRAINT "merchant_followers_follower_id_users_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "muted_users" ADD CONSTRAINT "muted_users_muter_id_users_id_fk" FOREIGN KEY ("muter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "muted_users" ADD CONSTRAINT "muted_users_muted_id_users_id_fk" FOREIGN KEY ("muted_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_sessions" ADD CONSTRAINT "payment_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_sessions" ADD CONSTRAINT "payment_sessions_wallet_id_payment_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."payment_wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_wallets" ADD CONSTRAINT "payment_wallets_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_fees" ADD CONSTRAINT "product_fees_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_fees" ADD CONSTRAINT "product_fees_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_payment_wallets" ADD CONSTRAINT "product_payment_wallets_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_merchant_id_users_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_snapshots" ADD CONSTRAINT "purchase_snapshots_escrow_order_id_escrow_orders_id_fk" FOREIGN KEY ("escrow_order_id") REFERENCES "public"."escrow_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_parent_review_id_reviews_id_fk" FOREIGN KEY ("parent_review_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slider_banner_items" ADD CONSTRAINT "slider_banner_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "splash_screen" ADD CONSTRAINT "splash_screen_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocker_id_users_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocked_id_users_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_wallets" ADD CONSTRAINT "user_wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "virtual_wallets" ADD CONSTRAINT "virtual_wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_merchant_id_users_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;