import nodemailer from "nodemailer";
import { storage } from "./storage";

let transporter: nodemailer.Transporter | null = null;

// Get the site URL from environment or use default
function getSiteUrl(): string {
  // Always use shophub.duckdns.org for email links
  return "http://shophub.duckdns.org";
}

function getTransporter() {
  if (!transporter) {
    const gmailUser = process.env.GMAIL_USER;
    const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;

    if (!gmailUser || !gmailAppPassword) {
      console.log("[Email] Gmail credentials not configured - email notifications disabled");
      console.log("[Email] GMAIL_USER:", gmailUser ? "SET" : "NOT SET");
      console.log("[Email] GMAIL_APP_PASSWORD:", gmailAppPassword ? "SET" : "NOT SET");
      return null;
    }

    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: gmailUser,
        pass: gmailAppPassword,
      },
    });
    
    console.log("[Email] Transporter initialized successfully with user:", gmailUser);
  }
  return transporter;
}

// Initialize transporter on startup
export function initializeEmailService() {
  const transporter = getTransporter();
  if (transporter) {
    console.log("[Email] Email service initialized and ready to send notifications");
  } else {
    console.log("[Email] Email service initialization FAILED - check Gmail credentials");
  }
}

export function isEmailConfigured(): boolean {
  return !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

export function getConfiguredEmail(): string | null {
  return process.env.GMAIL_USER || null;
}

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  recipientUserId?: string;
  emailType: "chat" | "purchase" | "sale" | "payment_confirmation";
}

// Common email wrapper template
function getEmailWrapper(content: string, title: string): string {
  const siteUrl = getSiteUrl();
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
      <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
          <td align="center" style="padding: 40px 20px;">
            <table role="presentation" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
              <tr>
                <td style="padding: 40px 30px;">
                  ${content}
                </td>
              </tr>
              <tr>
                <td style="padding: 20px 30px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; border-radius: 0 0 12px 12px;">
                  <p style="margin: 0; font-size: 12px; color: #6b7280; text-align: center;">
                    This email was sent from ShopHub. If you did not expect this email, please ignore it.
                  </p>
                  <p style="margin: 10px 0 0 0; font-size: 12px; color: #6b7280; text-align: center;">
                    <a href="${siteUrl}" style="color: #6366f1; text-decoration: none;">Visit ShopHub</a>
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
}

// Format date to readable string
function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  }).format(date);
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  const transport = getTransporter();
  if (!transport) {
    console.log("[Email] Skipping email - no transporter configured");
    return false;
  }

  try {
    console.log(`[Email] Attempting to send to ${options.to}: ${options.subject}`);
    
    await transport.sendMail({
      from: `"ShopHub" <${process.env.GMAIL_USER}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });
    console.log(`[Email] Successfully sent to ${options.to}: ${options.subject}`);
    
    await storage.createEmailLog({
      recipientEmail: options.to,
      recipientUserId: options.recipientUserId || null,
      emailType: options.emailType,
      subject: options.subject,
      status: "sent",
    });
    
    return true;
  } catch (error) {
    console.error("[Email] Failed to send:", error);
    
    await storage.createEmailLog({
      recipientEmail: options.to,
      recipientUserId: options.recipientUserId || null,
      emailType: options.emailType,
      subject: options.subject,
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });
    
    return false;
  }
}

// Enhanced Chat Notification - when user is offline and receives a message
export async function sendChatNotification(
  recipientId: string,
  senderUsername: string,
  messagePreview: string,
  messageTime?: Date
): Promise<boolean> {
  const settings = await storage.getNotificationSettings(recipientId);
  console.log(`[Email] Checking notification settings for user ${recipientId}:`, {
    exists: !!settings,
    enabled: settings?.notificationsEnabled,
    chatEnabled: settings?.chatNotifications,
    email: settings?.email || "NO EMAIL"
  });
  
  if (!settings || !settings.notificationsEnabled || !settings.chatNotifications || !settings.email) {
    console.log(`[Email] Chat notification SKIPPED for ${recipientId}:`, {
      noSettings: !settings,
      notEnabled: settings && !settings.notificationsEnabled,
      chatDisabled: settings && !settings.chatNotifications,
      noEmail: settings && !settings.email
    });
    return false;
  }

  const siteUrl = getSiteUrl();
  const timestamp = formatDate(messageTime || new Date());
  const subject = `New Message from ${senderUsername}`;
  
  const content = `
    <div style="text-align: center; margin-bottom: 30px;">
      <div style="width: 60px; height: 60px; background: linear-gradient(135deg, #6366f1, #8b5cf6); border-radius: 50%; margin: 0 auto 15px; display: flex; align-items: center; justify-content: center;">
        <span style="font-size: 28px; color: white;">&#9993;</span>
      </div>
      <h1 style="margin: 0; font-size: 24px; color: #111827; font-weight: 600;">New Message Received</h1>
    </div>
    
    <div style="background: linear-gradient(135deg, #f0f9ff, #e0f2fe); padding: 25px; border-radius: 12px; margin: 25px 0; border-left: 4px solid #0ea5e9;">
      <p style="margin: 0 0 10px 0; font-size: 14px; color: #64748b;">
        <strong>From:</strong> ${senderUsername}
      </p>
      <p style="margin: 0 0 15px 0; font-size: 14px; color: #64748b;">
        <strong>Received:</strong> ${timestamp}
      </p>
      <div style="background: white; padding: 15px; border-radius: 8px; margin-top: 10px;">
        <p style="margin: 0; font-size: 16px; color: #374151; line-height: 1.6;">
          "${messagePreview.substring(0, 300)}${messagePreview.length > 300 ? '...' : ''}"
        </p>
      </div>
    </div>
    
    <div style="text-align: center; margin-top: 30px;">
      <a href="${siteUrl}/messages" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4);">
        View Message & Reply
      </a>
    </div>
    
    <p style="margin-top: 25px; text-align: center; color: #6b7280; font-size: 14px;">
      Click the button above to read the full message and reply.
    </p>
  `;

  return sendEmail({
    to: settings.email,
    subject,
    html: getEmailWrapper(content, subject),
    recipientUserId: recipientId,
    emailType: "chat",
  });
}

// Enhanced Sale Notification - when merchant's product is sold
export async function sendSaleNotification(
  merchantId: string,
  buyerUsername: string,
  productName: string,
  price: string,
  productId?: string,
  orderId?: string,
  quantity?: number
): Promise<boolean> {
  const settings = await storage.getNotificationSettings(merchantId);
  if (!settings || !settings.notificationsEnabled || !settings.saleNotifications || !settings.email) {
    console.log(`[Email] Sale notification skipped - settings not configured for merchant ${merchantId}`);
    return false;
  }

  const siteUrl = getSiteUrl();
  const timestamp = formatDate(new Date());
  const subject = `You Made a Sale! - ${productName}`;
  
  const viewProductUrl = productId ? `${siteUrl}/product/${productId}` : siteUrl;
  const dashboardUrl = `${siteUrl}/merchant/dashboard`;
  
  const content = `
    <div style="text-align: center; margin-bottom: 30px;">
      <div style="width: 60px; height: 60px; background: linear-gradient(135deg, #10b981, #059669); border-radius: 50%; margin: 0 auto 15px; display: flex; align-items: center; justify-content: center;">
        <span style="font-size: 28px; color: white;">&#10003;</span>
      </div>
      <h1 style="margin: 0; font-size: 24px; color: #111827; font-weight: 600;">Congratulations! You Made a Sale!</h1>
      <p style="margin: 10px 0 0 0; color: #6b7280; font-size: 16px;">Someone just purchased your product</p>
    </div>
    
    <div style="background: linear-gradient(135deg, #f0fdf4, #dcfce7); padding: 25px; border-radius: 12px; margin: 25px 0; border-left: 4px solid #10b981;">
      <h3 style="margin: 0 0 20px 0; color: #166534; font-size: 18px;">Order Details</h3>
      
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #bbf7d0; color: #374151; font-weight: 500;">Product</td>
          <td style="padding: 10px 0; border-bottom: 1px solid #bbf7d0; color: #111827; text-align: right; font-weight: 600;">${productName}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #bbf7d0; color: #374151; font-weight: 500;">Price</td>
          <td style="padding: 10px 0; border-bottom: 1px solid #bbf7d0; color: #111827; text-align: right; font-weight: 600;">${price}</td>
        </tr>
        ${quantity ? `
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #bbf7d0; color: #374151; font-weight: 500;">Quantity</td>
          <td style="padding: 10px 0; border-bottom: 1px solid #bbf7d0; color: #111827; text-align: right; font-weight: 600;">${quantity}</td>
        </tr>
        ` : ''}
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #bbf7d0; color: #374151; font-weight: 500;">Buyer</td>
          <td style="padding: 10px 0; border-bottom: 1px solid #bbf7d0; color: #111827; text-align: right; font-weight: 600;">${buyerUsername}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; color: #374151; font-weight: 500;">Date & Time</td>
          <td style="padding: 10px 0; color: #111827; text-align: right; font-size: 13px;">${timestamp}</td>
        </tr>
      </table>
    </div>
    
    <div style="background: #fffbeb; padding: 15px 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #fcd34d;">
      <p style="margin: 0; color: #92400e; font-size: 14px;">
        <strong>Note:</strong> Payment is held in 24-hour escrow for security. Funds will be released to your wallet after the escrow period.
      </p>
    </div>
    
    <div style="text-align: center; margin-top: 30px;">
      <a href="${dashboardUrl}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #10b981, #059669); color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.4); margin-right: 10px;">
        View Dashboard
      </a>
      <a href="${viewProductUrl}" style="display: inline-block; padding: 14px 32px; background: white; color: #10b981; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; border: 2px solid #10b981; margin-left: 10px;">
        View Product
      </a>
    </div>
  `;

  return sendEmail({
    to: settings.email,
    subject,
    html: getEmailWrapper(content, subject),
    recipientUserId: merchantId,
    emailType: "sale",
  });
}

// Payment Confirmation Email - sent to buyer when payment is received and in escrow
export async function sendPaymentConfirmationNotification(
  buyerId: string,
  productName: string,
  price: string,
  merchantName: string,
  cryptoAmount: string,
  coinSymbol: string,
  transactionHash?: string,
  escrowExpiresAt?: Date
): Promise<boolean> {
  const settings = await storage.getNotificationSettings(buyerId);
  if (!settings || !settings.notificationsEnabled || !settings.purchaseNotifications || !settings.email) {
    console.log(`[Email] Payment confirmation skipped - settings not configured for buyer ${buyerId}`);
    return false;
  }

  const siteUrl = getSiteUrl();
  const timestamp = formatDate(new Date());
  const expiryTime = escrowExpiresAt ? formatDate(escrowExpiresAt) : "24 hours from payment confirmation";
  const subject = `Payment Confirmed - ${productName}`;
  
  const ordersUrl = `${siteUrl}/orders`;
  
  const content = `
    <div style="text-align: center; margin-bottom: 30px;">
      <div style="width: 60px; height: 60px; background: linear-gradient(135deg, #10b981, #059669); border-radius: 50%; margin: 0 auto 15px; display: flex; align-items: center; justify-content: center;">
        <span style="font-size: 28px; color: white;">&#10003;</span>
      </div>
      <h1 style="margin: 0; font-size: 24px; color: #111827; font-weight: 600;">Payment Received!</h1>
      <p style="margin: 10px 0 0 0; color: #6b7280; font-size: 16px;">Your payment has been confirmed and is now in escrow</p>
    </div>
    
    <div style="background: linear-gradient(135deg, #f0fdf4, #dcfce7); padding: 25px; border-radius: 12px; margin: 25px 0; border-left: 4px solid #10b981;">
      <h3 style="margin: 0 0 20px 0; color: #166534; font-size: 18px;">Purchase Details</h3>
      
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #bbf7d0; color: #374151; font-weight: 500;">Product</td>
          <td style="padding: 10px 0; border-bottom: 1px solid #bbf7d0; color: #111827; text-align: right; font-weight: 600;">${productName}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #bbf7d0; color: #374151; font-weight: 500;">Amount (USD)</td>
          <td style="padding: 10px 0; border-bottom: 1px solid #bbf7d0; color: #111827; text-align: right; font-weight: 600;">${price}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #bbf7d0; color: #374151; font-weight: 500;">Amount (${coinSymbol})</td>
          <td style="padding: 10px 0; border-bottom: 1px solid #bbf7d0; color: #111827; text-align: right; font-weight: 600;">${cryptoAmount} ${coinSymbol}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #bbf7d0; color: #374151; font-weight: 500;">Merchant</td>
          <td style="padding: 10px 0; border-bottom: 1px solid #bbf7d0; color: #111827; text-align: right; font-weight: 600;">${merchantName}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; color: #374151; font-weight: 500;">Payment Time</td>
          <td style="padding: 10px 0; color: #111827; text-align: right; font-size: 13px;">${timestamp}</td>
        </tr>
      </table>
    </div>
    
    ${transactionHash ? `
    <div style="background: #f8fafc; padding: 15px 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e2e8f0;">
      <p style="margin: 0; color: #475569; font-size: 13px;">
        <strong>Transaction Hash:</strong><br>
        <code style="word-break: break-all; font-size: 12px; color: #6366f1;">${transactionHash}</code>
      </p>
    </div>
    ` : ''}
    
    <div style="background: linear-gradient(135deg, #eff6ff, #dbeafe); padding: 20px; border-radius: 12px; margin: 25px 0; border-left: 4px solid #3b82f6;">
      <h4 style="margin: 0 0 10px 0; color: #1e40af; font-size: 16px;">&#128274; Escrow Protection</h4>
      <p style="margin: 0; color: #1e3a8a; font-size: 14px; line-height: 1.6;">
        Your payment is held securely in escrow for <strong>24 hours</strong> for your protection. This ensures you receive your product safely before funds are released to the merchant.
      </p>
      <p style="margin: 10px 0 0 0; color: #64748b; font-size: 13px;">
        <strong>Escrow expires:</strong> ${expiryTime}
      </p>
    </div>
    
    <div style="text-align: center; margin-top: 30px;">
      <a href="${ordersUrl}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4);">
        View Your Orders
      </a>
    </div>
    
    <p style="margin-top: 25px; text-align: center; color: #6b7280; font-size: 14px;">
      Thank you for your purchase! If you have any issues, please contact support.
    </p>
  `;

  return sendEmail({
    to: settings.email,
    subject,
    html: getEmailWrapper(content, subject),
    recipientUserId: buyerId,
    emailType: "payment_confirmation",
  });
}

// Purchase Notification (simplified) - sent when order is created
export async function sendPurchaseNotification(
  buyerId: string,
  productName: string,
  price: string,
  merchantName: string
): Promise<boolean> {
  const settings = await storage.getNotificationSettings(buyerId);
  if (!settings || !settings.notificationsEnabled || !settings.purchaseNotifications || !settings.email) {
    console.log(`[Email] Purchase notification skipped - settings not configured for buyer ${buyerId}`);
    return false;
  }

  const siteUrl = getSiteUrl();
  const timestamp = formatDate(new Date());
  const subject = `Order Created - ${productName}`;
  
  const ordersUrl = `${siteUrl}/orders`;
  
  const content = `
    <div style="text-align: center; margin-bottom: 30px;">
      <div style="width: 60px; height: 60px; background: linear-gradient(135deg, #f59e0b, #d97706); border-radius: 50%; margin: 0 auto 15px; display: flex; align-items: center; justify-content: center;">
        <span style="font-size: 28px; color: white;">&#128722;</span>
      </div>
      <h1 style="margin: 0; font-size: 24px; color: #111827; font-weight: 600;">Order Created</h1>
      <p style="margin: 10px 0 0 0; color: #6b7280; font-size: 16px;">Complete your payment to finalize the purchase</p>
    </div>
    
    <div style="background: linear-gradient(135deg, #fffbeb, #fef3c7); padding: 25px; border-radius: 12px; margin: 25px 0; border-left: 4px solid #f59e0b;">
      <h3 style="margin: 0 0 20px 0; color: #92400e; font-size: 18px;">Order Details</h3>
      
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #fcd34d; color: #374151; font-weight: 500;">Product</td>
          <td style="padding: 10px 0; border-bottom: 1px solid #fcd34d; color: #111827; text-align: right; font-weight: 600;">${productName}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #fcd34d; color: #374151; font-weight: 500;">Price</td>
          <td style="padding: 10px 0; border-bottom: 1px solid #fcd34d; color: #111827; text-align: right; font-weight: 600;">${price}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #fcd34d; color: #374151; font-weight: 500;">Merchant</td>
          <td style="padding: 10px 0; border-bottom: 1px solid #fcd34d; color: #111827; text-align: right; font-weight: 600;">${merchantName}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; color: #374151; font-weight: 500;">Order Time</td>
          <td style="padding: 10px 0; color: #111827; text-align: right; font-size: 13px;">${timestamp}</td>
        </tr>
      </table>
    </div>
    
    <div style="text-align: center; margin-top: 30px;">
      <a href="${ordersUrl}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #f59e0b, #d97706); color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 14px rgba(245, 158, 11, 0.4);">
        Complete Payment
      </a>
    </div>
    
    <p style="margin-top: 25px; text-align: center; color: #6b7280; font-size: 14px;">
      Please complete your crypto payment to finalize this purchase.
    </p>
  `;

  return sendEmail({
    to: settings.email,
    subject,
    html: getEmailWrapper(content, subject),
    recipientUserId: buyerId,
    emailType: "purchase",
  });
}

export async function shouldSendChatNotification(
  recipientId: string,
  senderId: string,
  isRecipientOnline: boolean
): Promise<boolean> {
  console.log(`[Email] Starting notification check for recipient: ${recipientId}, sender: ${senderId}, online: ${isRecipientOnline}`);
  
  if (isRecipientOnline) {
    console.log(`[Email] ✗ Recipient is online, skipping email`);
    return false;
  }

  const isMuted = await storage.isUserMuted(recipientId, senderId);
  if (isMuted) {
    console.log(`[Email] ✗ Sender is muted by recipient`);
    return false;
  }

  const settings = await storage.getNotificationSettings(recipientId);
  console.log(`[Email] Settings check:`, {
    hasSettings: !!settings,
    notificationsEnabled: settings?.notificationsEnabled,
    chatNotifications: settings?.chatNotifications,
    email: settings?.email || "MISSING"
  });
  
  if (!settings || !settings.notificationsEnabled || !settings.chatNotifications || !settings.email) {
    console.log(`[Email] ✗ Notifications disabled or not configured`);
    return false;
  }

  console.log(`[Email] ✓ WILL SEND EMAIL to ${settings.email}`);
  return true;
}
