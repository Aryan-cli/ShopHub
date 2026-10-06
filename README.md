# 🛍️ ShopHub

**ShopHub** is a privacy-focused crypto marketplace built with **Node.js** and **PostgreSQL**, featuring a built-in **crypto wallet, escrow-based payments, merchant accounts, real-time chat, dispute management, ratings, favorites, email notifications, and a powerful admin dashboard**.

ShopHub is designed around one core principle:

> **Buyers should be protected by the escrow system, while sellers should have a simple and permissionless way to list products.**

Users can register with only a username and password. There is no mandatory phone-number or email verification for account creation, keeping the platform simple and privacy-oriented.

---

## ✨ Features

### 🛒 Marketplace

* Modern homepage and product marketplace
* Product detail pages
* Product search and browsing
* Product favorites/bookmarks
* Seller product management
* Product ratings and reviews
* Verified-buyer rating system
* Seller/merchant profiles
* Product purchasing through crypto

### 🔐 Built-in Escrow

ShopHub includes a built-in escrow payment system designed to protect buyers and sellers.

When a buyer purchases a product:

1. The buyer starts a purchase.
2. The payment is held by the escrow system.
3. The seller fulfills the order according to the escrow rules.
4. The buyer can confirm the transaction.
5. Once the escrow conditions are satisfied, the payment is released.
6. The seller receives the released funds in their **Merchant Wallet**.

If something goes wrong, the transaction can enter a **dispute** and be reviewed through the Admin Dashboard.

> Escrow rules should be clearly documented for users, since they define when funds can be released or refunded.

---

## 💰 Crypto Wallet

ShopHub includes a built-in wallet system for storing supported stablecoins/crypto assets.

Users can:

* Maintain an internal wallet
* Store supported crypto assets
* Use wallet balances for marketplace purchases
* Receive funds
* Use crypto for escrow transactions

The project can also be configured with a wallet master seed through the environment configuration.

```env
BTC_MASTER_SEED=""
```

**Important:** Never commit a real wallet seed phrase to GitHub. Use environment variables or a dedicated secret-management system.

---

## 🏪 Merchant Accounts

Anyone can become a seller without a manual seller verification process.

A user can open a merchant account directly from their profile:

**Profile → Open Your Merchant Account**

Once activated, ShopHub creates a merchant wallet and exposes merchant functionality such as:

* Product creation
* Product editing
* Product management
* Product listings
* Merchant wallet
* Escrow payment receiving

When an escrow transaction is successfully released, the seller's funds are credited to their merchant wallet.

This makes the marketplace permissionless while the escrow and admin systems provide mechanisms for handling fraudulent or prohibited activity.

---

## 💬 Built-in Chat

ShopHub includes an integrated messaging system.

Users can communicate with:

* Friends
* Buyers
* Sellers
* Other marketplace users

Buyer/seller conversations can be used to discuss orders, products, delivery/fulfillment, or other transaction-related matters.

---

## ⭐ Ratings & Reviews

ShopHub includes a rating system designed to help buyers evaluate sellers and products.

Ratings can be associated with completed purchases, with **verified buyers** receiving additional trust through the platform's verification logic.

This helps establish marketplace reputation over time.

---

## ❤️ Favorites

Users can bookmark products they are interested in.

The Favorites section allows users to:

* Save products for later
* Quickly return to interesting listings
* Keep track of products they may want to purchase

---

## 📧 Email Notifications

ShopHub supports email notifications through Gmail.

Users can optionally provide an email address for receiving platform notifications.

Notifications can be sent for events such as:

* New messages
* Purchases
* Marketplace activity
* Other supported account events

Gmail configuration can be provided through environment variables:

```env
GMAIL_USER=""
GMAIL_APP_PASSWORD=""
```

A Gmail App Password should be used rather than a normal Gmail account password.

---

# 🛡️ Admin Dashboard

ShopHub includes a dedicated administration panel for managing the marketplace.

The default admin username is:

```text
Admin
```

The admin password can be configured through:

```env
ADMIN_PASSWORD="Admin@123"
```

**Change the default password before deploying the application publicly.**

---

## 🔧 Admin Features

### 👥 User Management

Administrators can manage platform users and take action against:

* Fraudulent accounts
* Abusive behavior
* Prohibited activity
* Illegal products
* Marketplace violations

Administrative actions can include banning or restricting accounts.

---

### ⚖️ Dispute Management

Administrators can review escrow disputes and help resolve transactions where the buyer and seller cannot reach an agreement.

The admin dispute system can be used to:

* Review disputed transactions
* Examine transaction information
* Resolve disputes
* Control escrow outcomes according to the platform's rules

---

### 📦 Product Management

Administrators can view marketplace products uploaded by users.

This allows administrators to identify and remove:

* Illegal products
* Prohibited listings
* Fraudulent listings
* Policy violations
* Other unwanted marketplace content

---

### 💸 Platform Fee Management

ShopHub supports configurable platform fees.

Administrators can configure fees that are applied to marketplace purchases.

The platform can therefore generate revenue from transactions through marketplace fees.

Collected platform fees can also be managed through the administrative withdrawal system.

---

### 💰 Fee Withdrawal

The Admin Dashboard includes functionality for withdrawing accumulated platform fees.

An additional withdrawal password can be configured through the environment configuration.

> Keep administrative withdrawal credentials separate from normal admin credentials and protect them using secure secret management.

---

## 🎨 Splash Screen Editor

ShopHub includes a customizable splash screen system.

Administrators can modify the website's loading/splash experience through an editor available inside the Admin Dashboard.

This allows the appearance or loading content of the platform to be changed without manually modifying the application source code every time.

---

# 🔒 Privacy-Focused Authentication

ShopHub intentionally keeps account registration simple.

Users can register using:

```text
Username
Password
```

Email and phone-number verification are not required for normal registration.

This design reduces the amount of personally identifiable information required to use the marketplace.

However, administrators should still implement appropriate abuse prevention, rate limiting, password protection, and account-security controls before deploying the platform publicly.

---

# 🏗️ Technology Stack

ShopHub is built using a Node.js-based architecture.

### Backend

* Node.js
* JavaScript/TypeScript-based server architecture
* PostgreSQL
* Session-based authentication
* Environment-based configuration

### Database

ShopHub uses **PostgreSQL**.

The database connection is configured through:

```env
DATABASE_URL=""
```

### Email

* Gmail SMTP / App Password
* Configurable email notifications

### Crypto

* Built-in wallet functionality
* Escrow-based marketplace payments
* Configurable wallet seed
* Crypto purchasing integration

---

# ⚙️ Environment Configuration

Create a `.env` file in the project root.

Example:

```env
# Server
PORT=8000

# PostgreSQL
DATABASE_URL=""

# Admin
ADMIN_PASSWORD="Admin@123"

# Admin withdrawal/security password
# Configure this according to the application's expected variable name.
ADMIN_WITHDRAWAL_PASSWORD=""

# Crypto wallet
BTC_MASTER_SEED=""

# Session security
SESSION_SECRET=""

# Gmail notifications
GMAIL_USER=""
GMAIL_APP_PASSWORD=""
```

### Environment Variables

| Variable                    | Description                                         |
| --------------------------- | --------------------------------------------------- |
| `PORT`                      | Port used by the application                        |
| `DATABASE_URL`              | PostgreSQL database connection string               |
| `ADMIN_PASSWORD`            | Admin dashboard login password                      |
| `BTC_MASTER_SEED`           | Wallet master seed used by the crypto wallet system |
| `SESSION_SECRET`            | Secret used for application sessions                |
| `GMAIL_USER`                | Gmail account used for notifications                |
| `GMAIL_APP_PASSWORD`        | Gmail App Password used to send emails              |
| `ADMIN_WITHDRAWAL_PASSWORD` | Password protecting administrative withdrawals      |

Use strong, randomly generated secrets in production.

---

# 🚀 Installation

## 1. Clone the repository

```bash
git clone https://github.com/Aryan-cli/ShopHub
cd ShopHub
```

## 2. Install dependencies

```bash
npm install
```

## 3. Configure environment variables

Create a `.env` file:

```env
PORT=8000
DATABASE_URL=""
ADMIN_PASSWORD=""
BTC_MASTER_SEED=""
SESSION_SECRET=""
GMAIL_USER=""
GMAIL_APP_PASSWORD=""
```

Fill in the appropriate values for your environment.

---

# 🗄️ Database Setup

ShopHub uses PostgreSQL.

After configuring:

```env
DATABASE_URL=""
```

push the database schema:

```bash
npm run db:push
```

Run this when initializing a new database or when you need to synchronize schema changes.

---

# ▶️ Running the Application

Start the development server with:

```bash
npm run dev
```

The application will run on the port configured in:

```env
PORT=8000
```

For example:

```text
http://localhost:8000
```

---

# 📋 Quick Start

The basic setup process is:

```bash
npm install

npm run db:push

npm run dev
```

### Typical Development Workflow

```bash
# Install dependencies
npm install

# Push database schema
npm run db:push

# Start development server
npm run dev
```

You generally only need to run `npm run db:push` when initializing the database or after making schema changes.

---

# 🔐 Production Security

Before deploying ShopHub publicly, **do not use the example credentials from this README**.

At minimum:

* Change `ADMIN_PASSWORD`
* Set a strong `SESSION_SECRET`
* Never commit `.env`
* Never commit wallet seed phrases
* Never expose private keys or wallet secrets
* Use a secure PostgreSQL database
* Use HTTPS
* Use a secure Gmail App Password
* Restrict administrative access
* Add appropriate rate limiting
* Keep dependencies updated
* Back up the database
* Protect administrative withdrawal functionality
* Monitor suspicious marketplace activity

Add `.env` to `.gitignore`:

```gitignore
.env
.env.*
!.env.example
```

You can provide a safe template for contributors:

```env
PORT=8000
DATABASE_URL=""
ADMIN_PASSWORD=""
BTC_MASTER_SEED=""
SESSION_SECRET=""
GMAIL_USER=""
GMAIL_APP_PASSWORD=""
ADMIN_WITHDRAWAL_PASSWORD=""
```

---

# ⚠️ Crypto & Escrow Disclaimer

ShopHub handles cryptocurrency-related functionality and escrowed transactions.

A production deployment should be carefully audited before handling real funds.

In particular, wallet generation, private-key/seed handling, transaction signing, escrow state transitions, dispute resolution, withdrawals, and authorization controls should receive a professional security review.

**Never use a real wallet seed phrase in source code or commit it to a public repository.**

---

# 🗺️ Core Marketplace Flow

```text
                 ┌─────────────────┐
                 │     ShopHub     │
                 └────────┬────────┘
                          │
          ┌───────────────┼────────────────┐
          │               │                │
          ▼               ▼                ▼
      👤 Users         🛍️ Products      💬 Chat
          │               │                │
          │               ▼                │
          │          🏪 Merchant            │
          │            Account              │
          │               │                 │
          └───────────────┼─────────────────┘
                          ▼
                   💰 Crypto Payment
                          │
                          ▼
                     🔐 Escrow
                          │
                   ┌──────┴──────┐
                   │             │
                   ▼             ▼
              ✅ Completed    ⚖️ Dispute
                   │             │
                   ▼             ▼
             Merchant Wallet   Admin Review
                   │
                   ▼
             💸 Seller Funds
```

### 👨‍💻 Creator & Ownership

*   **Owner & Developer:** [Aryan Mishra](https://github.com/Aryan-cli)
*   **Project Started:** 2022
*   **Public Release:** 2024/2025

> **Note on History:** ShopHub was originally built and developed in 2022. However, it was pushed to GitHub much later because the developer was not using Git/GitHub at that time. The project has since been maintained and updated for public use.

---

# 📁 Project Concept

ShopHub combines the functionality of a traditional marketplace with crypto payments and escrow.

Instead of requiring every seller to go through a manual onboarding process, users can become merchants directly. The platform's safety model relies on escrow, transaction rules, moderation, dispute management, and administrative controls.

The result is a marketplace architecture consisting of:

**Marketplace + Crypto Wallet + Escrow + Merchant System + Messaging + Moderation + Admin Panel**

---

## ⭐ ShopHub

**A privacy-focused crypto marketplace with built-in escrow, wallets, merchants, messaging, and marketplace administration.**
