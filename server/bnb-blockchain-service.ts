/**
 * BNB Payment Verification Service using BSC RPC directly
 * Uses Binance Smart Chain RPC endpoint (free, no API key required)
 * Fallback to BSCScan API for transaction lists
 */

interface RpcResponse<T> {
  jsonrpc: string;
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

interface BscScanResponse<T> {
  status: string;
  message: string;
  result: T;
}

interface BscScanTransaction {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  nonce: string;
  blockHash: string;
  transactionIndex: string;
  from: string;
  to: string;
  value: string;
  gas: string;
  gasPrice: string;
  isError: string;
  txreceipt_status: string;
  input: string;
  contractAddress: string;
  cumulativeGasUsed: string;
  gasUsed: string;
  confirmations: string;
  methodId: string;
  functionName: string;
}

interface BscScanInternalTransaction {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  from: string;
  to: string;
  value: string;
  contractAddress: string;
  input: string;
  type: string;
  gas: string;
  gasUsed: string;
  traceId: string;
  isError: string;
  errCode: string;
}

interface BnbTransaction {
  txHash: string;
  value: number;
  confirmations: number;
  time: number;
  fromAddress: string;
  toAddress: string;
  isError: boolean;
}

interface BnbAddressInfo {
  address: string;
  balance: number;
  transactions: BnbTransaction[];
}

interface PaymentVerificationResult {
  verified: boolean;
  txHash?: string;
  actualAmount?: number;
  confirmations?: number;
  fromAddress?: string;
}

interface TransactionDetails {
  confirmed: boolean;
  confirmations: number;
  value: number;
  from: string;
  to: string;
}

interface SearchPaymentResult {
  found: boolean;
  txHash?: string;
  confirmations?: number;
}

interface RpcTransaction {
  blockNumber: string | null;
  from: string;
  to: string | null;
  value: string;
  hash: string;
}

interface RpcLog {
  address?: string;
  topics?: string[];
  data?: string;
}

interface RpcReceipt {
  status: string;
  blockNumber: string;
  logs?: RpcLog[];
}

interface RpcBlock {
  timestamp: string;
  number: string;
}

export class BnbBlockchainService {
  // BSC RPC endpoints (free, no API key required)
  private readonly bscRpcUrls = [
    'https://bsc-dataseed.binance.org',
    'https://bsc-dataseed1.binance.org',
    'https://bsc-dataseed2.binance.org',
    'https://bsc-dataseed3.binance.org',
    'https://bsc-dataseed4.binance.org',
  ];
  
  // BSCScan API for transaction lists (fallback)
  private readonly bscApiUrl = 'https://api.bscscan.com/api';
  private readonly weiPerBnb = 1e18;
  private rpcIndex = 0;

  private get apiKey(): string {
    return process.env.BSCSCAN_API_KEY || '';
  }

  private getNextRpcUrl(): string {
    const url = this.bscRpcUrls[this.rpcIndex];
    this.rpcIndex = (this.rpcIndex + 1) % this.bscRpcUrls.length;
    return url;
  }

  // Direct BSC RPC call (no API key needed)
  private async rpcCall<T>(method: string, params: any[]): Promise<T | null> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const rpcUrl = this.getNextRpcUrl();
      try {
        console.log(`[BnbBlockchainService] RPC call to ${rpcUrl}: ${method}`);
        const response = await fetch(rpcUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method,
            params,
            id: Date.now(),
          }),
        });

        if (!response.ok) {
          console.error(`[BnbBlockchainService] RPC HTTP error: ${response.status}`);
          continue;
        }

        const data = await response.json() as RpcResponse<T>;
        
        if (data.error) {
          console.error(`[BnbBlockchainService] RPC error: ${data.error.message}`);
          continue;
        }

        return data.result ?? null;
      } catch (error) {
        console.error(`[BnbBlockchainService] RPC attempt ${attempt + 1} failed:`, error);
        await new Promise(resolve => setTimeout(resolve, 300 * (attempt + 1)));
      }
    }
    return null;
  }

  private hexToBigInt(hex: string): bigint {
    if (!hex || hex === '0x') return BigInt(0);
    return BigInt(hex);
  }

  private hexToNumber(hex: string): number {
    if (!hex || hex === '0x') return 0;
    return Number(BigInt(hex));
  }

  // Get transaction by hash using direct RPC (no API key needed)
  async getTransaction(txHash: string): Promise<TransactionDetails | null> {
    try {
      console.log(`[BnbBlockchainService] Getting transaction via RPC: ${txHash}`);

      // Get transaction
      const tx = await this.rpcCall<RpcTransaction>('eth_getTransactionByHash', [txHash]);

      if (!tx) {
        console.log('[BnbBlockchainService] Transaction not found');
        return null;
      }

      console.log(`[BnbBlockchainService] Transaction found: from=${tx.from}, to=${tx.to}`);

      // Get receipt
      const receipt = await this.rpcCall<RpcReceipt>('eth_getTransactionReceipt', [txHash]);

      let confirmations = 0;
      if (receipt?.blockNumber) {
        // Get current block
        const currentBlockHex = await this.rpcCall<string>('eth_blockNumber', []);
        if (currentBlockHex) {
          const currentBlock = this.hexToNumber(currentBlockHex);
          const txBlock = this.hexToNumber(receipt.blockNumber);
          confirmations = Math.max(0, currentBlock - txBlock + 1);
          console.log(`[BnbBlockchainService] Block: ${txBlock}, Current: ${currentBlock}, Confirmations: ${confirmations}`);
        }
      }

      const valueWei = this.hexToBigInt(tx.value);
      const value = Number(valueWei) / this.weiPerBnb;

      return {
        confirmed: confirmations > 0,
        confirmations,
        value,
        from: tx.from || '',
        to: tx.to || '',
      };
    } catch (error) {
      console.error('[BnbBlockchainService] Failed to get transaction:', error);
      return null;
    }
  }

  /**
   * Verify a payment using transaction hash directly via RPC (no API key needed)
   * This is the preferred method when the user provides their transaction hash
   */
  async verifyPaymentByTxHash(
    txHash: string,
    depositAddress: string,
    expectedAmount: number,
    buyerAddress?: string
  ): Promise<PaymentVerificationResult> {
    try {
      console.log(`[BnbBlockchainService] Verifying payment by TX hash: ${txHash}`);
      console.log(`[BnbBlockchainService] Expected: ${expectedAmount} BNB to ${depositAddress}`);

      if (!txHash || !txHash.startsWith('0x') || txHash.length !== 66) {
        console.log('[BnbBlockchainService] Invalid transaction hash format');
        return { verified: false };
      }

      const tx = await this.getTransaction(txHash);

      if (!tx) {
        console.log('[BnbBlockchainService] Transaction not found on blockchain');
        return { verified: false };
      }

      console.log(`[BnbBlockchainService] TX details: from=${tx.from}, to=${tx.to}, value=${tx.value} BNB`);

      // Verify destination address matches
      if (tx.to.toLowerCase() !== depositAddress.toLowerCase()) {
        console.log(`[BnbBlockchainService] Destination mismatch: expected ${depositAddress}, got ${tx.to}`);
        return { verified: false };
      }

      // Verify sender address if provided
      if (buyerAddress && tx.from.toLowerCase() !== buyerAddress.toLowerCase()) {
        console.log(`[BnbBlockchainService] Sender mismatch: expected ${buyerAddress}, got ${tx.from}`);
        return { verified: false };
      }

      // Verify amount with strict tolerance (2% or minimum 0.000001 BNB) to prevent underpayment
      const amountDiff = Math.abs(tx.value - expectedAmount);
      const percentageTolerance = expectedAmount * 0.02;
      const minimumTolerance = 0.000001;
      const tolerance = Math.max(percentageTolerance, minimumTolerance);

      console.log(`[BnbBlockchainService] Amount check: received=${tx.value}, expected=${expectedAmount}, diff=${amountDiff}, tolerance=${tolerance}`);

      if (amountDiff > tolerance) {
        console.log(`[BnbBlockchainService] Amount mismatch: ${tx.value} vs ${expectedAmount} (tolerance: ${tolerance})`);
        return { verified: false };
      }

      // Check confirmations
      if (tx.confirmations < 1) {
        console.log('[BnbBlockchainService] Transaction not yet confirmed');
        return { verified: false };
      }

      console.log(`[BnbBlockchainService] Payment VERIFIED via TX hash! Confirmations: ${tx.confirmations}`);
      return {
        verified: true,
        txHash,
        actualAmount: tx.value,
        confirmations: tx.confirmations,
        fromAddress: tx.from,
      };
    } catch (error) {
      console.error('[BnbBlockchainService] TX hash verification failed:', error);
      return { verified: false };
    }
  }

  // Get balance using RPC
  async getBalance(address: string): Promise<number> {
    try {
      const balanceHex = await this.rpcCall<string>('eth_getBalance', [address, 'latest']);
      if (!balanceHex) return 0;
      return Number(this.hexToBigInt(balanceHex)) / this.weiPerBnb;
    } catch (error) {
      console.error('[BnbBlockchainService] Failed to get balance:', error);
      return 0;
    }
  }

  // Get current block number
  async getCurrentBlock(): Promise<number> {
    const blockHex = await this.rpcCall<string>('eth_blockNumber', []);
    return blockHex ? this.hexToNumber(blockHex) : 0;
  }

  // Helper to build BSCScan API URL
  private buildApiUrl(params: Record<string, string>): string {
    const searchParams = new URLSearchParams({
      ...params,
      apikey: this.apiKey,
    });
    return `${this.bscApiUrl}?${searchParams.toString()}`;
  }

  private async fetchWithRetry<T>(url: string, retries = 3): Promise<BscScanResponse<T> | null> {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(url, {
          headers: {
            'Accept': 'application/json',
          },
        });

        if (!response.ok) {
          console.error(`[BnbBlockchainService] HTTP error: ${response.status}`);
          return null;
        }

        const data = await response.json() as BscScanResponse<T>;
        
        if (data.message === 'NOTOK' && data.result && typeof data.result === 'string') {
          if (data.result.includes('rate limit')) {
            console.log('[BnbBlockchainService] Rate limited, waiting...');
            await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
            continue;
          }
          console.error(`[BnbBlockchainService] API error: ${data.result}`);
          return null;
        }

        return data;
      } catch (error) {
        console.error(`[BnbBlockchainService] Fetch attempt ${i + 1} failed:`, error);
        if (i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, 500 * (i + 1)));
        }
      }
    }
    return null;
  }

  async getAddressInfo(address: string): Promise<BnbAddressInfo | null> {
    try {
      console.log(`[BnbBlockchainService] Getting address info for: ${address}`);
      
      // Get balance via RPC (no API key needed)
      const balance = await this.getBalance(address);
      console.log(`[BnbBlockchainService] Address balance: ${balance} BNB`);

      // Try to get transactions from BSCScan API (requires API key)
      let transactions: BnbTransaction[] = [];
      
      if (this.apiKey) {
        // Fetch normal transactions
        const txResponse = await this.fetchWithRetry<BscScanTransaction[]>(
          this.buildApiUrl({ module: 'account', action: 'txlist', address, startblock: '0', endblock: '99999999', page: '1', offset: '100', sort: 'desc' })
        );

        // Also fetch internal transactions (from smart contracts, exchanges, etc.)
        const internalTxResponse = await this.fetchWithRetry<BscScanInternalTransaction[]>(
          this.buildApiUrl({ module: 'account', action: 'txlistinternal', address, startblock: '0', endblock: '99999999', page: '1', offset: '100', sort: 'desc' })
        );

        // Process normal transactions
        if (txResponse && Array.isArray(txResponse.result)) {
          console.log(`[BnbBlockchainService] Found ${txResponse.result.length} normal transactions`);

          const normalTxs = txResponse.result
            .filter((tx) => tx.to && tx.to.toLowerCase() === address.toLowerCase())
            .map((tx) => ({
              txHash: tx.hash,
              value: parseFloat(tx.value) / this.weiPerBnb,
              confirmations: parseInt(tx.confirmations) || 0,
              time: parseInt(tx.timeStamp) * 1000,
              fromAddress: tx.from,
              toAddress: tx.to,
              isError: tx.isError === '1',
            }))
            .filter((tx) => !tx.isError && tx.value > 0);

          transactions.push(...normalTxs);
          console.log(`[BnbBlockchainService] ${normalTxs.length} valid incoming normal transactions`);
        }

        // Process internal transactions (from exchanges, smart contracts)
        if (internalTxResponse && Array.isArray(internalTxResponse.result)) {
          console.log(`[BnbBlockchainService] Found ${internalTxResponse.result.length} internal transactions`);

          const currentBlock = await this.getCurrentBlock();

          const internalTxs = internalTxResponse.result
            .filter((tx) => tx.to && tx.to.toLowerCase() === address.toLowerCase())
            .map((tx) => {
              const txBlock = parseInt(tx.blockNumber) || 0;
              const confirmations = currentBlock > 0 ? Math.max(0, currentBlock - txBlock + 1) : 0;
              return {
                txHash: tx.hash,
                value: parseFloat(tx.value) / this.weiPerBnb,
                confirmations,
                time: parseInt(tx.timeStamp) * 1000,
                fromAddress: tx.from,
                toAddress: tx.to,
                isError: tx.isError === '1',
              };
            })
            .filter((tx) => !tx.isError && tx.value > 0);

          // Avoid duplicates by checking txHash
          const existingHashes = new Set(transactions.map(t => t.txHash));
          const uniqueInternalTxs = internalTxs.filter(tx => !existingHashes.has(tx.txHash));
          
          transactions.push(...uniqueInternalTxs);
          console.log(`[BnbBlockchainService] ${uniqueInternalTxs.length} valid incoming internal transactions (unique)`);
        }
      } else {
        console.log('[BnbBlockchainService] No API key, skipping transaction list fetch');
      }

      console.log(`[BnbBlockchainService] Total ${transactions.length} valid incoming transactions`);

      return {
        address,
        balance,
        transactions,
      };
    } catch (error) {
      console.error('[BnbBlockchainService] Failed to get address info:', error);
      return null;
    }
  }

  async verifyPayment(
    depositAddress: string,
    expectedAmount: number,
    buyerAddress?: string,
    minTimestampMs?: number
  ): Promise<PaymentVerificationResult> {
    try {
      console.log(`[BnbBlockchainService] Verifying BNB payment to ${depositAddress}`);
      console.log(`[BnbBlockchainService] Expected amount: ${expectedAmount} BNB`);
      if (buyerAddress) {
        console.log(`[BnbBlockchainService] Buyer address filter: ${buyerAddress}`);
      }
      if (minTimestampMs) {
        console.log(`[BnbBlockchainService] Only counting transactions after: ${new Date(minTimestampMs).toISOString()}`);
      }

      const addressInfo = await this.getAddressInfo(depositAddress);

      if (!addressInfo) {
        console.log('[BnbBlockchainService] Could not get address info');
        return { verified: false };
      }

      console.log(`[BnbBlockchainService] Checking ${addressInfo.transactions.length} incoming transactions`);

      for (const tx of addressInfo.transactions) {
        // Skip transactions that happened before the escrow order was created
        if (minTimestampMs && tx.time < minTimestampMs) {
          console.log(`[BnbBlockchainService] TX ${tx.txHash.substring(0, 16)}... skipped - too old (${new Date(tx.time).toISOString()})`);
          continue;
        }

        const amountDiff = Math.abs(tx.value - expectedAmount);
        // Strict tolerance: 2% or minimum 0.000001 BNB to prevent underpayment fraud
        const percentageTolerance = expectedAmount * 0.02;
        const minimumTolerance = 0.000001;
        const tolerance = Math.max(percentageTolerance, minimumTolerance);

        console.log(`[BnbBlockchainService] TX ${tx.txHash.substring(0, 16)}...:`);
        console.log(`  Amount: ${tx.value} BNB (expected: ${expectedAmount} BNB)`);
        console.log(`  Time: ${new Date(tx.time).toISOString()}`);
        console.log(`  Diff: ${amountDiff}, Tolerance: ${tolerance}`);
        console.log(`  Confirmations: ${tx.confirmations}`);
        console.log(`  From: ${tx.fromAddress}`);

        if (amountDiff <= tolerance) {
          if (buyerAddress && tx.fromAddress.toLowerCase() !== buyerAddress.toLowerCase()) {
            console.log(`[BnbBlockchainService] Sender mismatch: expected ${buyerAddress}, got ${tx.fromAddress}`);
            continue;
          }

          console.log(`[BnbBlockchainService] Payment VERIFIED! TxHash: ${tx.txHash}`);
          return {
            verified: true,
            txHash: tx.txHash,
            actualAmount: tx.value,
            confirmations: tx.confirmations,
            fromAddress: tx.fromAddress,
          };
        }
      }

      console.log('[BnbBlockchainService] No matching payment found');
      return { verified: false };
    } catch (error) {
      console.error('[BnbBlockchainService] Payment verification error:', error);
      return { verified: false };
    }
  }

  async searchPaymentByBuyerAddress(
    buyerAddress: string,
    expectedAmount: number,
    depositAddress: string,
    minTimestampMs?: number
  ): Promise<SearchPaymentResult> {
    try {
      console.log(`[BnbBlockchainService] Searching for payment from ${buyerAddress} to ${depositAddress}`);
      console.log(`[BnbBlockchainService] Expected amount: ${expectedAmount} BNB`);
      if (minTimestampMs) {
        console.log(`[BnbBlockchainService] Only counting transactions after: ${new Date(minTimestampMs).toISOString()}`);
      }

      if (!this.apiKey) {
        console.log('[BnbBlockchainService] No API key for transaction list lookup');
        return { found: false };
      }

      // Increased tolerance to 10% to account for gas fees
      const percentageTolerance = expectedAmount * 0.10;
      const minimumTolerance = 0.0001;
      const tolerance = Math.max(percentageTolerance, minimumTolerance);

      // Check normal transactions
      const txResponse = await this.fetchWithRetry<BscScanTransaction[]>(
        this.buildApiUrl({ module: 'account', action: 'txlist', address: buyerAddress, startblock: '0', endblock: '99999999', page: '1', offset: '100', sort: 'desc' })
      );

      if (txResponse && Array.isArray(txResponse.result)) {
        for (const tx of txResponse.result) {
          if (!tx.to || tx.to.toLowerCase() !== depositAddress.toLowerCase()) {
            continue;
          }

          if (tx.isError === '1') {
            continue;
          }

          // Skip transactions that happened before the escrow order was created
          const txTime = parseInt(tx.timeStamp) * 1000;
          if (minTimestampMs && txTime < minTimestampMs) {
            console.log(`[BnbBlockchainService] TX ${tx.hash.substring(0, 16)}... skipped - too old`);
            continue;
          }

          const value = parseFloat(tx.value) / this.weiPerBnb;

          console.log(`[BnbBlockchainService] Found TX to deposit address: ${tx.hash}`);
          console.log(`  Amount: ${value} BNB (expected: ${expectedAmount} BNB)`);
          console.log(`  Time: ${new Date(txTime).toISOString()}`);

          if (Math.abs(value - expectedAmount) <= tolerance) {
            console.log(`[BnbBlockchainService] MATCH FOUND! Confirmations: ${tx.confirmations}`);
            return {
              found: true,
              txHash: tx.hash,
              confirmations: parseInt(tx.confirmations) || 0,
            };
          }
        }
      }

      // Also check internal transactions (from exchanges, smart contracts)
      const internalTxResponse = await this.fetchWithRetry<BscScanInternalTransaction[]>(
        this.buildApiUrl({ module: 'account', action: 'txlistinternal', address: buyerAddress, startblock: '0', endblock: '99999999', page: '1', offset: '100', sort: 'desc' })
      );

      if (internalTxResponse && Array.isArray(internalTxResponse.result)) {
        const currentBlock = await this.getCurrentBlock();

        for (const tx of internalTxResponse.result) {
          if (!tx.to || tx.to.toLowerCase() !== depositAddress.toLowerCase()) {
            continue;
          }

          if (tx.isError === '1') {
            continue;
          }

          // Skip transactions that happened before the escrow order was created
          const txTime = parseInt(tx.timeStamp) * 1000;
          if (minTimestampMs && txTime < minTimestampMs) {
            console.log(`[BnbBlockchainService] Internal TX ${tx.hash.substring(0, 16)}... skipped - too old`);
            continue;
          }

          const value = parseFloat(tx.value) / this.weiPerBnb;
          const txBlock = parseInt(tx.blockNumber) || 0;
          const confirmations = currentBlock > 0 ? Math.max(0, currentBlock - txBlock + 1) : 0;

          console.log(`[BnbBlockchainService] Found internal TX to deposit address: ${tx.hash}`);
          console.log(`  Amount: ${value} BNB (expected: ${expectedAmount} BNB)`);
          console.log(`  Time: ${new Date(txTime).toISOString()}`);

          if (Math.abs(value - expectedAmount) <= tolerance) {
            console.log(`[BnbBlockchainService] MATCH FOUND (internal)! Confirmations: ${confirmations}`);
            return {
              found: true,
              txHash: tx.hash,
              confirmations,
            };
          }
        }
      }

      console.log('[BnbBlockchainService] No matching payment found from buyer address');
      return { found: false };
    } catch (error) {
      console.error('[BnbBlockchainService] Search failed:', error);
      return { found: false };
    }
  }

  async getCurrentBnbPrice(): Promise<number> {
    try {
      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=binancecoin&vs_currencies=usd');
      if (response.ok) {
        const data = await response.json();
        const price = data.binancecoin?.usd;
        if (price) {
          console.log(`[BnbBlockchainService] BNB price from CoinGecko: $${price}`);
          return price;
        }
      }
    } catch (error) {
      console.error('[BnbBlockchainService] CoinGecko price API failed');
    }

    console.log('[BnbBlockchainService] Using fallback BNB price: $650');
    return 650;
  }

  isValidBnbAddress(address: string): boolean {
    if (!address || typeof address !== 'string') return false;
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  /**
   * Verify USDT ERC-20 token transfer (same network as BNB)
   * USDT contract: 0x55d398326f99059fF775485246999027B3197955
   * Simple verification - just check transaction exists and went to right recipient
   */
  async verifyUsdtPayment(
    txHash: string,
    depositAddress: string,
    expectedAmount: number,
    buyerAddress?: string
  ): Promise<PaymentVerificationResult> {
    try {
      console.log(`[BnbBlockchainService] Verifying USDT payment by TX hash: ${txHash}`);
      console.log(`[BnbBlockchainService] Expected: ${expectedAmount} USDT to ${depositAddress}`);

      if (!txHash || !txHash.startsWith('0x') || txHash.length !== 66) {
        console.log('[BnbBlockchainService] Invalid transaction hash format');
        return { verified: false };
      }

      const tx = await this.getTransaction(txHash);

      if (!tx) {
        console.log('[BnbBlockchainService] Transaction not found on blockchain');
        return { verified: false };
      }

      // Get transaction receipt
      const receipt = await this.rpcCall<RpcReceipt>('eth_getTransactionReceipt', [txHash]);
      if (!receipt) {
        console.log('[BnbBlockchainService] Transaction receipt not found');
        return { verified: false };
      }

      console.log(`[BnbBlockchainService] USDT TX details: from=${tx.from}, to=${tx.to}`);

      const usdtContractAddress = '0x55d398326f99059fF775485246999027B3197955';
      
      // Verify transaction is to USDT contract
      if (tx.to.toLowerCase() !== usdtContractAddress.toLowerCase()) {
        console.log(`[BnbBlockchainService] Transaction not to USDT contract. Got: ${tx.to}`);
        return { verified: false };
      }
      
      // Find matching transfer log to our deposit address
      const transferEventTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
      let foundValidTransfer = false;
      let actualAmount = 0;
      
      if (receipt.logs && Array.isArray(receipt.logs)) {
        for (const log of receipt.logs) {
          // Check if this is a Transfer event from USDT contract
          if (log.address?.toLowerCase() === usdtContractAddress.toLowerCase() &&
              log.topics && log.topics[0] === transferEventTopic &&
              log.topics[2]) {
            
            // Extract recipient address from log topics
            const recipient = '0x' + log.topics[2].slice(-40);
            
            if (recipient.toLowerCase() === depositAddress.toLowerCase()) {
              // Extract amount from log data (USDT has 18 decimals on BSC)
              if (log.data) {
                const amountHex = log.data.replace('0x', '');
                const amountBigInt = BigInt('0x' + amountHex);
                actualAmount = Number(amountBigInt) / 1e18; // USDT has 18 decimals
              }
              console.log(`[BnbBlockchainService] Found valid USDT transfer to ${recipient}, amount: ${actualAmount}`);
              foundValidTransfer = true;
              break;
            }
          }
        }
      }
      
      if (!foundValidTransfer) {
        console.log(`[BnbBlockchainService] No USDT transfer found to ${depositAddress}`);
        return { verified: false };
      }
      
      // Verify amount with 2% tolerance (same as BNB) to prevent underpayment
      const amountDiff = Math.abs(actualAmount - expectedAmount);
      const percentageTolerance = expectedAmount * 0.02;
      const minimumTolerance = 0.000001;
      const tolerance = Math.max(percentageTolerance, minimumTolerance);
      
      console.log(`[BnbBlockchainService] USDT amount check: received=${actualAmount}, expected=${expectedAmount}, diff=${amountDiff}, tolerance=${tolerance}`);
      
      if (amountDiff > tolerance) {
        console.log(`[BnbBlockchainService] USDT Amount mismatch: ${actualAmount} vs ${expectedAmount} (tolerance: ${tolerance})`);
        return { verified: false };
      }
      
      // Check confirmations
      let confirmations = 0;
      if (receipt?.blockNumber) {
        const currentBlockHex = await this.rpcCall<string>('eth_blockNumber', []);
        if (currentBlockHex) {
          const currentBlock = this.hexToNumber(currentBlockHex);
          const txBlock = this.hexToNumber(receipt.blockNumber);
          confirmations = Math.max(0, currentBlock - txBlock + 1);
        }
      }

      if (confirmations < 1) {
        console.log('[BnbBlockchainService] USDT Transaction not yet confirmed');
        return { verified: false };
      }

      console.log(`[BnbBlockchainService] USDT Payment VERIFIED! Confirmations: ${confirmations}`);
      return {
        verified: true,
        txHash,
        actualAmount: actualAmount,
        confirmations,
        fromAddress: tx.from,
      };
    } catch (error) {
      console.error('[BnbBlockchainService] USDT verification failed:', error);
      return { verified: false };
    }
  }

  generateDemoAddress(index: number): { address: string; path: string } {
    const chars = '0123456789abcdef';
    let suffix = '';
    let seed = index + 54321;
    for (let i = 0; i < 40; i++) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      suffix += chars.charAt(seed % chars.length);
    }
    return {
      address: `0x${suffix}`,
      path: `bnb-demo/${index}`,
    };
  }
}

export const bnbBlockchainService = new BnbBlockchainService();
