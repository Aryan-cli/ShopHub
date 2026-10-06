import * as bip39 from 'bip39';
import BIP32Factory from 'bip32';
import * as ecc from 'tiny-secp256k1';
import { createHash } from 'crypto';
import jsSha3 from 'js-sha3';
import { Wallet, JsonRpcProvider, parseEther, formatEther, Contract, AbiCoder } from 'ethers';

const bip32 = BIP32Factory(ecc);

function keccak256(data: Buffer): Buffer {
  return Buffer.from(jsSha3.keccak256.arrayBuffer(data));
}

export class BnbWalletService {
  private masterNode: ReturnType<typeof bip32.fromSeed> | null = null;
  private initialized = false;

  async initialize(): Promise<void> {
    const masterSeed = process.env.BNB_MASTER_SEED || process.env.BTC_MASTER_SEED;
    
    if (!masterSeed) {
      console.warn('[BnbWalletService] No master seed set - using demo mode');
      this.initialized = false;
      return;
    }

    try {
      if (!bip39.validateMnemonic(masterSeed)) {
        console.error('[BnbWalletService] Invalid mnemonic provided');
        this.initialized = false;
        return;
      }

      const seed = await bip39.mnemonicToSeed(masterSeed);
      this.masterNode = bip32.fromSeed(seed);
      this.initialized = true;
      console.log('[BnbWalletService] Initialized with HD wallet for BNB');
    } catch (error) {
      console.error('[BnbWalletService] Failed to initialize:', error);
      this.initialized = false;
    }
  }

  isInitialized(): boolean {
    return this.initialized && this.masterNode !== null;
  }

  deriveAddress(index: number): { address: string; path: string } {
    if (!this.isInitialized() || !this.masterNode) {
      throw new Error('BNB wallet not initialized - BNB_MASTER_SEED or BTC_MASTER_SEED environment variable required');
    }

    try {
      const path = `m/44'/60'/0'/0/${index}`;
      const child = this.masterNode.derivePath(path);
      
      const pubKeyBuffer = Buffer.from(child.publicKey);
      const uncompressedPubKey = this.getUncompressedPublicKey(pubKeyBuffer);
      const pubKeyWithoutPrefix = uncompressedPubKey.slice(1);
      
      const hash = keccak256(pubKeyWithoutPrefix);
      const address = '0x' + hash.slice(-20).toString('hex');
      
      console.log(`[BnbWalletService] Derived BNB address at ${path}: ${address}`);
      
      return { address: this.toChecksumAddress(address), path };
    } catch (error) {
      console.error('[BnbWalletService] Address derivation failed:', error);
      throw new Error('Failed to derive BNB address - check wallet configuration');
    }
  }

  derivePaymentAddress(merchantIndex: number, paymentIndex: number): { address: string; path: string } {
    if (!this.isInitialized() || !this.masterNode) {
      throw new Error('BNB wallet not initialized - BNB_MASTER_SEED or BTC_MASTER_SEED environment variable required');
    }

    try {
      const path = `m/44'/60'/0'/${merchantIndex}/${paymentIndex}`;
      const child = this.masterNode.derivePath(path);
      
      const pubKeyBuffer = Buffer.from(child.publicKey);
      const uncompressedPubKey = this.getUncompressedPublicKey(pubKeyBuffer);
      const pubKeyWithoutPrefix = uncompressedPubKey.slice(1);
      
      const hash = keccak256(pubKeyWithoutPrefix);
      const address = '0x' + hash.slice(-20).toString('hex');
      
      console.log(`[BnbWalletService] Derived BNB payment address at ${path}: ${address}`);
      
      return { address: this.toChecksumAddress(address), path };
    } catch (error) {
      console.error('[BnbWalletService] Payment address derivation failed:', error);
      throw new Error('Failed to derive BNB payment address - check wallet configuration');
    }
  }

  private getUncompressedPublicKey(compressedKey: Buffer): Buffer {
    // For Ethereum/BNB address derivation, we need the uncompressed public key (65 bytes)
    // The compressed key from BIP32 is 33 bytes starting with 02 or 03
    try {
      // Convert Buffer to Uint8Array for tiny-secp256k1
      const compressedUint8 = new Uint8Array(compressedKey);
      
      // Use pointCompress with compressed=false to get uncompressed (65 bytes)
      const uncompressed = ecc.pointCompress(compressedUint8, false);
      
      if (uncompressed && uncompressed.length === 65) {
        return Buffer.from(uncompressed);
      }
      
      // Fallback: If pointCompress doesn't work, try alternative approach
      // Check if the key is already valid by verifying it's on the curve
      if (ecc.isPoint(compressedUint8)) {
        // The key is valid, pointCompress should have worked
        console.error('[BnbWalletService] pointCompress returned invalid result for valid point');
      }
      
      throw new Error(`Failed to get uncompressed public key - result length: ${uncompressed?.length || 'null'}`);
    } catch (error) {
      console.error('[BnbWalletService] Public key decompression failed:', error);
      throw new Error('Failed to decompress public key for BNB address');
    }
  }

  private toChecksumAddress(address: string): string {
    const addr = address.toLowerCase().replace('0x', '');
    const hash = keccak256(Buffer.from(addr)).toString('hex');
    
    let checksumAddress = '0x';
    for (let i = 0; i < addr.length; i++) {
      if (parseInt(hash[i], 16) >= 8) {
        checksumAddress += addr[i].toUpperCase();
      } else {
        checksumAddress += addr[i];
      }
    }
    
    return checksumAddress;
  }

  private generateFallbackAddress(index: number): { address: string; path: string } {
    // Generate deterministic fallback address based on index (always same for same index)
    const seed = `bnb-fallback-deterministic-${index}`;
    const hash = createHash('sha256').update(seed).digest('hex');
    return {
      address: `0x${hash.slice(0, 40)}`,
      path: `bnb-demo/${index}`,
    };
  }

  static generateNewMnemonic(): string {
    return bip39.generateMnemonic(256);
  }

  static validateMnemonic(mnemonic: string): boolean {
    return bip39.validateMnemonic(mnemonic);
  }

  async getAddressBalance(address: string): Promise<{ balance: number } | null> {
    const apiKey = process.env.BSCSCAN_API_KEY;
    try {
      const url = `https://api.bscscan.com/api?module=account&action=balance&address=${address}&tag=latest&apikey=${apiKey || ''}`;
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
      console.error('[BnbWalletService] Get balance failed:', error);
      return null;
    }
  }

  // Get private key for a specific derivation path
  private getPrivateKey(path: string): Buffer | null {
    if (!this.isInitialized() || !this.masterNode) {
      return null;
    }

    try {
      const child = this.masterNode.derivePath(path);
      if (child.privateKey) {
        return Buffer.from(child.privateKey);
      }
      return null;
    } catch (error) {
      console.error('[BnbWalletService] Failed to get private key:', error);
      return null;
    }
  }

  // Send BNB to an address using ethers.js for reliable transaction signing
  async sendBnb(
    fromPath: string,
    toAddress: string,
    amount: number
  ): Promise<{ success: boolean; txHash?: string; error?: string; gasFee?: number }> {
    if (!this.isInitialized()) {
      return { success: false, error: 'BNB wallet not initialized' };
    }

    const privateKey = this.getPrivateKey(fromPath);
    if (!privateKey) {
      return { success: false, error: 'Failed to get private key for signing' };
    }

    const rpcUrl = process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org';

    try {
      // Create ethers provider and wallet
      const provider = new JsonRpcProvider(rpcUrl, {
        name: 'bsc',
        chainId: 56
      });
      
      // Create wallet from private key
      const privateKeyHex = '0x' + privateKey.toString('hex');
      const wallet = new Wallet(privateKeyHex, provider);
      
      console.log(`[BnbWalletService] Sending from address: ${wallet.address}`);
      console.log(`[BnbWalletService] Sending ${amount} BNB to: ${toAddress}`);
      
      // Check balance first
      const balance = await provider.getBalance(wallet.address);
      console.log(`[BnbWalletService] Current balance: ${formatEther(balance)} BNB`);
      
      // Get current gas price
      const feeData = await provider.getFeeData();
      const gasPrice = feeData.gasPrice || BigInt(5000000000);
      const gasLimit = BigInt(21000);
      const gasFee = Number(gasPrice * gasLimit) / 1e18;
      
      // Convert amount to wei
      const amountWei = parseEther(amount.toString());
      const totalNeeded = amountWei + (gasPrice * gasLimit);
      
      if (balance < totalNeeded) {
        return { 
          success: false, 
          error: `Insufficient balance. Have: ${formatEther(balance)} BNB, Need: ${formatEther(totalNeeded)} BNB` 
        };
      }
      
      // Send transaction
      const tx = await wallet.sendTransaction({
        to: toAddress,
        value: amountWei,
        gasLimit: gasLimit,
        gasPrice: gasPrice
      });
      
      console.log(`[BnbWalletService] Transaction sent! Hash: ${tx.hash}`);
      
      // Wait for confirmation
      const receipt = await tx.wait();
      
      if (receipt && receipt.status === 1) {
        console.log(`[BnbWalletService] Transaction confirmed in block ${receipt.blockNumber}`);
        return { success: true, txHash: tx.hash, gasFee };
      } else {
        return { success: false, error: 'Transaction failed on chain', txHash: tx.hash };
      }
    } catch (error: any) {
      console.error('[BnbWalletService] sendBnb failed:', error);
      return { success: false, error: `Send failed: ${error.message || error}` };
    }
  }

  // RLP encode a transaction
  private rlpEncode(input: any): Buffer {
    if (Array.isArray(input)) {
      const output = input.map(item => this.rlpEncode(item));
      const totalLength = output.reduce((acc, buf) => acc + buf.length, 0);
      if (totalLength < 56) {
        return Buffer.concat([Buffer.from([0xc0 + totalLength]), ...output]);
      } else {
        const lengthBytes = this.encodeLength(totalLength);
        return Buffer.concat([Buffer.from([0xf7 + lengthBytes.length]), lengthBytes, ...output]);
      }
    }

    let buffer: Buffer;
    if (typeof input === 'bigint') {
      if (input === BigInt(0)) {
        buffer = Buffer.alloc(0);
      } else {
        let hex = input.toString(16);
        if (hex.length % 2 !== 0) hex = '0' + hex;
        buffer = Buffer.from(hex, 'hex');
      }
    } else if (typeof input === 'number') {
      if (input === 0) {
        buffer = Buffer.alloc(0);
      } else {
        let hex = input.toString(16);
        if (hex.length % 2 !== 0) hex = '0' + hex;
        buffer = Buffer.from(hex, 'hex');
      }
    } else if (typeof input === 'string') {
      if (input.startsWith('0x')) {
        const hex = input.slice(2);
        buffer = hex.length === 0 ? Buffer.alloc(0) : Buffer.from(hex.length % 2 ? '0' + hex : hex, 'hex');
      } else {
        buffer = Buffer.from(input);
      }
    } else if (Buffer.isBuffer(input)) {
      buffer = input;
    } else {
      buffer = Buffer.alloc(0);
    }

    if (buffer.length === 1 && buffer[0] < 0x80) {
      return buffer;
    } else if (buffer.length < 56) {
      return Buffer.concat([Buffer.from([0x80 + buffer.length]), buffer]);
    } else {
      const lengthBytes = this.encodeLength(buffer.length);
      return Buffer.concat([Buffer.from([0xb7 + lengthBytes.length]), lengthBytes, buffer]);
    }
  }

  private encodeLength(length: number): Buffer {
    const result: number[] = [];
    while (length > 0) {
      result.unshift(length & 0xff);
      length = length >> 8;
    }
    return Buffer.from(result);
  }

  private async signTransaction(tx: {
    nonce: number;
    gasPrice: bigint;
    gasLimit: bigint;
    to: string;
    value: bigint;
    data: string;
    chainId: number;
  }, privateKey: Buffer): Promise<string | null> {
    try {
      // EIP-155 signing: hash (nonce, gasPrice, gasLimit, to, value, data, chainId, 0, 0)
      const rawTx = [
        tx.nonce,
        tx.gasPrice,
        tx.gasLimit,
        tx.to,
        tx.value,
        tx.data,
        tx.chainId,
        0,
        0
      ];

      const rlpEncoded = this.rlpEncode(rawTx);
      const msgHash = keccak256(rlpEncoded);

      // Sign the hash
      const signature = ecc.sign(new Uint8Array(msgHash), new Uint8Array(privateKey));
      if (!signature) {
        return null;
      }

      // Extract r and s from the signature
      const r = Buffer.from(signature.slice(0, 32));
      const s = Buffer.from(signature.slice(32, 64));

      // Calculate recovery id
      // Try both recovery ids (0 and 1) and see which one produces the correct public key
      let v = tx.chainId * 2 + 35;
      
      // Try to recover and verify
      const recoveryId = this.findRecoveryId(msgHash, signature, privateKey);
      if (recoveryId !== null) {
        v = tx.chainId * 2 + 35 + recoveryId;
      }

      // Build signed transaction
      const signedTx = [
        tx.nonce,
        tx.gasPrice,
        tx.gasLimit,
        tx.to,
        tx.value,
        tx.data,
        v,
        r,
        s
      ];

      const signedRlp = this.rlpEncode(signedTx);
      return '0x' + signedRlp.toString('hex');
    } catch (error) {
      console.error('[BnbWalletService] signTransaction failed:', error);
      return null;
    }
  }

  private findRecoveryId(msgHash: Buffer, signature: Uint8Array, privateKey: Buffer): number | null {
    const expectedPubKey = ecc.pointFromScalar(new Uint8Array(privateKey));
    if (!expectedPubKey) return null;

    for (let i = 0; i < 2; i++) {
      try {
        const recovered = ecc.recover(new Uint8Array(msgHash), signature, i);
        if (recovered && Buffer.from(recovered).equals(Buffer.from(expectedPubKey))) {
          return i;
        }
      } catch {
        continue;
      }
    }
    return 0; // Default to 0 if recovery fails
  }

  // Send USDT (ERC20 token on BSC)
  async sendUsdt(
    fromPath: string,
    toAddress: string,
    amount: number
  ): Promise<{ success: boolean; txHash?: string; error?: string; gasFee?: number }> {
    if (!this.isInitialized()) {
      return { success: false, error: 'BNB wallet not initialized' };
    }

    const privateKey = this.getPrivateKey(fromPath);
    if (!privateKey) {
      return { success: false, error: 'Failed to get private key for signing' };
    }

    const rpcUrl = process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org';
    const USDT_ADDRESS = '0x55d398326f99059fF775485246999027B3197955';
    const USDT_DECIMALS = 18;

    try {
      const provider = new JsonRpcProvider(rpcUrl, {
        name: 'bsc',
        chainId: 56
      });
      
      const privateKeyHex = '0x' + privateKey.toString('hex');
      const wallet = new Wallet(privateKeyHex, provider);
      
      console.log(`[BnbWalletService] Sending USDT from address: ${wallet.address}`);
      console.log(`[BnbWalletService] Sending ${amount} USDT to: ${toAddress}`);
      
      // Check BNB balance for gas
      const bnbBalance = await provider.getBalance(wallet.address);
      console.log(`[BnbWalletService] Current BNB balance: ${formatEther(bnbBalance)} BNB`);
      
      // Get current gas price
      const feeData = await provider.getFeeData();
      const gasPrice = feeData.gasPrice || BigInt(5000000000);
      const gasLimit = BigInt(100000); // Higher for token transfer
      const gasFee = Number(gasPrice * gasLimit) / 1e18;
      
      if (bnbBalance < (gasPrice * gasLimit)) {
        return { 
          success: false, 
          error: `Insufficient BNB for gas. Have: ${formatEther(bnbBalance)} BNB, Need: ${formatEther(gasPrice * gasLimit)} BNB` 
        };
      }
      
      // USDT transfer ABI
      const usdtAbi = [
        {
          constant: false,
          inputs: [
            { name: '_to', type: 'address' },
            { name: '_value', type: 'uint256' }
          ],
          name: 'transfer',
          outputs: [{ name: '', type: 'bool' }],
          type: 'function'
        }
      ];
      
      const usdtContract = new Contract(USDT_ADDRESS, usdtAbi, wallet);
      
      // Convert amount to smallest unit (USDT has 18 decimals)
      const amountInSmallestUnit = BigInt(Math.floor(amount * 1e18));
      
      // Send USDT
      const tx = await usdtContract.transfer(toAddress, amountInSmallestUnit, {
        gasLimit: gasLimit,
        gasPrice: gasPrice
      });
      
      console.log(`[BnbWalletService] USDT transaction sent! Hash: ${tx.hash}`);
      
      // Wait for confirmation
      const receipt = await tx.wait();
      
      if (receipt && receipt.status === 1) {
        console.log(`[BnbWalletService] USDT transaction confirmed in block ${receipt.blockNumber}`);
        return { success: true, txHash: tx.hash, gasFee };
      } else {
        return { success: false, error: 'USDT transaction failed on chain', txHash: tx.hash };
      }
    } catch (error: any) {
      console.error('[BnbWalletService] sendUsdt failed:', error);
      return { success: false, error: `Send failed: ${error.message || error}` };
    }
  }

  // Estimate gas fee for BNB transfer (21000 gas)
  async estimateGasFee(): Promise<number> {
    const rpcUrl = process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org';
    try {
      const gasPriceResponse = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_gasPrice',
          params: [],
          id: 1
        })
      });
      const gasPriceData = await gasPriceResponse.json();
      if (gasPriceData.error) {
        return 0.00003; // Default estimate for BNB transfer
      }
      const gasPrice = BigInt(gasPriceData.result);
      const gasLimit = BigInt(21000); // Native BNB transfer
      return Number(gasPrice * gasLimit) / 1e18;
    } catch {
      return 0.00003; // Default estimate for BNB transfer
    }
  }

  // Estimate gas fee for token transfer (100000 gas)
  async estimateTokenGasFee(): Promise<number> {
    const rpcUrl = process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org';
    try {
      const gasPriceResponse = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_gasPrice',
          params: [],
          id: 1
        })
      });
      const gasPriceData = await gasPriceResponse.json();
      if (gasPriceData.error) {
        return 0.003; // Default estimate for token transfer
      }
      const gasPrice = BigInt(gasPriceData.result);
      const gasLimit = BigInt(100000); // Token transfer
      return Number(gasPrice * gasLimit) / 1e18;
    } catch {
      return 0.003; // Default estimate for token transfer
    }
  }
}

export const bnbWalletService = new BnbWalletService();
