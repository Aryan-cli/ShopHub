import crypto from "crypto";

const ALCHEMY_PAY_BASE_URL = "https://ramp.alchemypay.org";
const ALCHEMY_PAY_APP_ID = "vn52E3md9v5614U0";
const ALCHEMY_PAY_SECRET = process.env.ALCHEMY_PAY_SECRET || "";
const MIN_AMOUNT_INR = 1000;

export class AlchemyPayService {
  private hasSecret(): boolean {
    return !!ALCHEMY_PAY_SECRET;
  }

  private generateSignature(params: Record<string, string>): string {
    if (!ALCHEMY_PAY_SECRET) {
      throw new Error("ALCHEMY_PAY_SECRET is not configured");
    }

    // Sort parameters and create signature string
    const sortedKeys = Object.keys(params).sort();
    const signString = sortedKeys
      .map((key) => `${key}=${params[key]}`)
      .join("&");

    // Generate HMAC-SHA256 signature and encode as base64
    const signature = crypto
      .createHmac("sha256", ALCHEMY_PAY_SECRET)
      .update(signString)
      .digest("base64");

    return signature;
  }

  generatePaymentUrl(
    walletAddress: string,
    fiatAmount: number,
    useSignature: boolean = false
  ): { url: string; amount: number; isSigned: boolean } {
    // Validate minimum amount
    if (fiatAmount < MIN_AMOUNT_INR) {
      throw new Error(`Minimum amount is ₹${MIN_AMOUNT_INR}`);
    }

    const params: Record<string, string> = {
      crypto: "USDT",
      network: "BSC",
      appId: ALCHEMY_PAY_APP_ID,
      address: walletAddress,
      fiat: "INR",
      fiatAmount: fiatAmount.toFixed(6),
    };

    let isSigned = false;

    // Generate signature if requested and secret is available
    if (useSignature && this.hasSecret()) {
      try {
        const sign = this.generateSignature(params);
        params.sign = sign;
        isSigned = true;
      } catch (error) {
        console.warn("[Alchemy Pay] Could not generate signature:", error);
      }
    }

    // Build URL with all parameters
    const queryString = new URLSearchParams(params).toString();
    const url = `${ALCHEMY_PAY_BASE_URL}/?${queryString}#/emailCode`;

    return {
      url,
      amount: fiatAmount,
      isSigned,
    };
  }
}

export const alchemyPayService = new AlchemyPayService();
