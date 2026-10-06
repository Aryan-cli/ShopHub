const BSC_RPC_URL = 'https://bsc-dataseed.binance.org';
const BSCSCAN_API = 'https://api.bscscan.com/api';

interface BnbTransaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  confirmations: number;
  timeStamp: string;
}

export class BnbService {
  private apiKey = process.env.BSCSCAN_API_KEY || '';

  async getAddressBalance(address: string): Promise<{ balance: number } | null> {
    try {
      const url = `${BSCSCAN_API}?module=account&action=balance&address=${address}&tag=latest&apikey=${this.apiKey}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      if (data.status !== '1') {
        return null;
      }

      return {
        balance: parseFloat(data.result) / 1e18,
      };
    } catch (error) {
      console.error('[BnbService] Get balance failed:', error);
      return null;
    }
  }

  async getTransactionsByAddress(address: string): Promise<BnbTransaction[]> {
    try {
      const url = `${BSCSCAN_API}?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&sort=desc&apikey=${this.apiKey}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      if (data.status !== '1' || !Array.isArray(data.result)) {
        return [];
      }

      return data.result.map((tx: any) => ({
        hash: tx.hash,
        from: tx.from,
        to: tx.to,
        value: tx.value,
        confirmations: parseInt(tx.confirmations) || 0,
        timeStamp: tx.timeStamp,
      }));
    } catch (error) {
      console.error('[BnbService] Get transactions failed:', error);
      return [];
    }
  }

  async verifyPayment(
    depositAddress: string,
    expectedAmount: number,
    senderAddress?: string
  ): Promise<{
    verified: boolean;
    txHash?: string;
    actualAmount?: number;
    confirmations?: number;
    fromAddress?: string;
  }> {
    try {
      const transactions = await this.getTransactionsByAddress(depositAddress);
      
      for (const tx of transactions) {
        if (tx.to.toLowerCase() !== depositAddress.toLowerCase()) {
          continue;
        }

        const txValue = parseFloat(tx.value) / 1e18;
        // Strict 2% tolerance to prevent underpayment
        const tolerance = expectedAmount * 0.02;
        
        if (Math.abs(txValue - expectedAmount) <= tolerance) {
          if (senderAddress && tx.from.toLowerCase() !== senderAddress.toLowerCase()) {
            continue;
          }
          
          return {
            verified: true,
            txHash: tx.hash,
            actualAmount: txValue,
            confirmations: tx.confirmations,
            fromAddress: tx.from,
          };
        }
      }

      return { verified: false };
    } catch (error) {
      console.error('[BnbService] Payment verification failed:', error);
      return { verified: false };
    }
  }

  async getCurrentBnbPrice(): Promise<number> {
    try {
      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=binancecoin&vs_currencies=usd');
      
      if (!response.ok) {
        return 600;
      }

      const data = await response.json();
      return data.binancecoin?.usd || 600;
    } catch (error) {
      console.error('[BnbService] Failed to get BNB price:', error);
      return 600;
    }
  }

  isValidBnbAddress(address: string): boolean {
    if (!address || typeof address !== 'string') return false;
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  generateDepositAddress(): { address: string; privateKey: string } {
    const chars = '0123456789abcdef';
    let address = '0x';
    let privateKey = '0x';
    
    for (let i = 0; i < 40; i++) {
      address += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    for (let i = 0; i < 64; i++) {
      privateKey += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    return { address, privateKey };
  }
}

export const bnbService = new BnbService();
