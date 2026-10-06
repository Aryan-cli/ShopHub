// Trust Wallet Deep Linking Service for BEP-20 USDT purchases

const TRUST_WALLET_BASE_URL = "https://link.trustwallet.com/send";

// BEP-20 USDT on BSC (Binance Smart Chain)
const USDT_ASSET_ID = "c20000714_t0x55d398326f99059fF775485246999027B3197955";
const USDT_BEP20_CONTRACT = "0x55d398326f99059fF775485246999027B3197955";
const BSC_CHAIN_ID = 56;

// INR to USDT conversion rate (approximate - consider using real-time rate API)
const INR_TO_USDT_RATE = 0.012; // 1 INR ≈ 0.012 USDT (adjust based on current rate)
const MIN_AMOUNT_INR = 1000;

export class TrustWalletService {
  /**
   * Convert INR amount to USDT amount
   * @param amountInr Amount in Indian Rupees
   * @returns Amount in USDT
   */
  convertInrToUsdt(amountInr: number): number {
    return parseFloat((amountInr * INR_TO_USDT_RATE).toFixed(6));
  }

  /**
   * Generate Trust Wallet deep link for buying USDT
   * Opens Trust Wallet app with pre-filled transaction details
   * 
   * @param userWalletAddress User's BEP-20 wallet address (where USDT will be sent)
   * @param amountInr Amount in INR to convert
   * @returns Object containing deep link and USDT amount
   */
  generateBuyLink(
    userWalletAddress: string,
    amountInr: number
  ): { url: string; amountUSDT: number; amountINR: number; memo: string } {
    // Validate minimum amount
    if (amountInr < MIN_AMOUNT_INR) {
      throw new Error(`Minimum amount is ₹${MIN_AMOUNT_INR}`);
    }

    // Validate wallet address format
    if (!userWalletAddress.startsWith("0x") || userWalletAddress.length !== 42) {
      throw new Error("Invalid wallet address format");
    }

    // Convert INR to USDT
    const amountUSDT = this.convertInrToUsdt(amountInr);

    // Create memo with transaction details
    const memo = `Buy USDT ₹${amountInr} = ${amountUSDT} USDT`;

    // Build Trust Wallet deep link parameters
    const params = new URLSearchParams({
      asset: USDT_ASSET_ID,
      address: userWalletAddress,
      amount: amountUSDT.toString(),
      memo: memo,
    });

    // Trust Wallet deep link URL
    const url = `${TRUST_WALLET_BASE_URL}?${params.toString()}`;

    console.log(
      `[Trust Wallet] Generated buy link for ${amountInr} INR = ${amountUSDT} USDT`
    );

    return {
      url,
      amountUSDT,
      amountINR: amountInr,
      memo,
    };
  }

  /**
   * Get current INR to USDT conversion rate
   * (In production, integrate with a real exchange rate API)
   */
  getConversionRate(): number {
    return INR_TO_USDT_RATE;
  }

  /**
   * Get USDT contract details for BSC
   */
  getUsdtContractDetails(): {
    contract: string;
    chainId: number;
    chain: string;
    assetId: string;
  } {
    return {
      contract: USDT_BEP20_CONTRACT,
      chainId: BSC_CHAIN_ID,
      chain: "Binance Smart Chain (BSC)",
      assetId: USDT_ASSET_ID,
    };
  }
}

export const trustWalletService = new TrustWalletService();
