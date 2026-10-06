import * as bip39 from 'bip39';
import BIP32Factory from 'bip32';
import * as ecc from 'tiny-secp256k1';
import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';

const bip32 = BIP32Factory(ecc);
const ECPair = ECPairFactory(ecc);

const NETWORK = bitcoin.networks.bitcoin;
const BLOCKCYPHER_API = 'https://api.blockcypher.com/v1/btc/main';

export class WalletService {
  private masterNode: ReturnType<typeof bip32.fromSeed> | null = null;
  private initialized = false;

  async initialize(): Promise<void> {
    const masterSeed = process.env.BTC_MASTER_SEED;
    
    if (!masterSeed) {
      console.warn('[WalletService] BTC_MASTER_SEED not set - using demo mode with generated addresses');
      this.initialized = false;
      return;
    }

    try {
      if (!bip39.validateMnemonic(masterSeed)) {
        console.error('[WalletService] Invalid mnemonic provided');
        this.initialized = false;
        return;
      }

      const seed = await bip39.mnemonicToSeed(masterSeed);
      this.masterNode = bip32.fromSeed(seed, NETWORK);
      this.initialized = true;
      console.log('[WalletService] Initialized with HD wallet');
    } catch (error) {
      console.error('[WalletService] Failed to initialize:', error);
      this.initialized = false;
    }
  }

  isInitialized(): boolean {
    return this.initialized && this.masterNode !== null;
  }

  deriveAddress(index: number): { address: string; path: string } {
    if (!this.isInitialized() || !this.masterNode) {
      throw new Error('BTC wallet not initialized - BTC_MASTER_SEED environment variable required');
    }

    try {
      const path = `m/84'/0'/0'/0/${index}`;
      const child = this.masterNode.derivePath(path);
      
      const { address } = bitcoin.payments.p2wpkh({
        pubkey: Buffer.from(child.publicKey),
        network: NETWORK,
      });

      if (!address) {
        throw new Error('Failed to generate address');
      }

      return { address, path };
    } catch (error) {
      console.error('[WalletService] Address derivation failed:', error);
      throw new Error('Failed to derive BTC address - check wallet configuration');
    }
  }

  derivePaymentAddress(merchantIndex: number, paymentIndex: number): { address: string; path: string } {
    if (!this.isInitialized() || !this.masterNode) {
      throw new Error('BTC wallet not initialized - BTC_MASTER_SEED environment variable required');
    }

    try {
      const path = `m/84'/0'/0'/${merchantIndex}/${paymentIndex}`;
      const child = this.masterNode.derivePath(path);
      
      const { address } = bitcoin.payments.p2wpkh({
        pubkey: Buffer.from(child.publicKey),
        network: NETWORK,
      });

      if (!address) {
        throw new Error('Failed to generate payment address');
      }

      return { address, path };
    } catch (error) {
      console.error('[WalletService] Payment address derivation failed:', error);
      throw new Error('Failed to derive BTC payment address - check wallet configuration');
    }
  }

  private generateDemoAddress(index: number): { address: string; path: string } {
    // Generate deterministic demo address based on index (always same for same index)
    const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
    let suffix = '';
    let seed = index + 12345; // Use index as seed for deterministic generation
    for (let i = 0; i < 38; i++) {
      seed = (seed * 1103515245 + 12345) % 2147483648; // Simple LCG for deterministic pseudo-random
      suffix += chars.charAt(seed % chars.length);
    }
    return {
      address: `bc1q${suffix}`,
      path: `demo/${index}`,
    };
  }

  static generateNewMnemonic(): string {
    return bip39.generateMnemonic(256);
  }

  static validateMnemonic(mnemonic: string): boolean {
    return bip39.validateMnemonic(mnemonic);
  }

  async sendBtc(
    fromPath: string,
    toAddress: string,
    amountBtc: number
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    if (!this.isInitialized() || !this.masterNode) {
      return { success: false, error: 'Wallet not initialized' };
    }

    const apiToken = process.env.BLOCKCYPHER_API_TOKEN;
    if (!apiToken) {
      return { success: false, error: 'BLOCKCYPHER_API_TOKEN not configured' };
    }

    try {
      const child = this.masterNode.derivePath(fromPath);
      const keyPair = ECPair.fromPrivateKey(Buffer.from(child.privateKey!));
      
      const { address: fromAddress } = bitcoin.payments.p2wpkh({
        pubkey: Buffer.from(child.publicKey),
        network: NETWORK,
      });

      if (!fromAddress) {
        return { success: false, error: 'Failed to derive source address' };
      }

      const amountSatoshi = Math.floor(amountBtc * 100000000);

      const newTxUrl = `${BLOCKCYPHER_API}/txs/new?token=${apiToken}`;
      const txSkeleton = {
        inputs: [{ addresses: [fromAddress] }],
        outputs: [{ addresses: [toAddress], value: amountSatoshi }],
      };

      const createResponse = await fetch(newTxUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(txSkeleton),
      });

      if (!createResponse.ok) {
        const errorData = await createResponse.json();
        return { success: false, error: errorData.error || 'Failed to create transaction' };
      }

      const txData = await createResponse.json();

      if (!txData.tosign || txData.tosign.length === 0) {
        return { success: false, error: 'No signatures required or insufficient funds' };
      }

      const signatures: string[] = [];
      const pubkeys: string[] = [];

      for (const toSign of txData.tosign) {
        const signature = keyPair.sign(Buffer.from(toSign, 'hex'));
        signatures.push(signature.toString('hex'));
        pubkeys.push(keyPair.publicKey.toString('hex'));
      }

      txData.signatures = signatures;
      txData.pubkeys = pubkeys;

      const sendUrl = `${BLOCKCYPHER_API}/txs/send?token=${apiToken}`;
      const sendResponse = await fetch(sendUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(txData),
      });

      if (!sendResponse.ok) {
        const errorData = await sendResponse.json();
        return { success: false, error: errorData.error || 'Failed to broadcast transaction' };
      }

      const result = await sendResponse.json();
      console.log('[WalletService] Transaction broadcast successful:', result.tx.hash);
      
      return { success: true, txHash: result.tx.hash };
    } catch (error: any) {
      console.error('[WalletService] Send BTC failed:', error);
      return { success: false, error: error.message || 'Unknown error occurred' };
    }
  }

  async getAddressBalance(address: string): Promise<{ balance: number; unconfirmed: number } | null> {
    const apiToken = process.env.BLOCKCYPHER_API_TOKEN;
    try {
      const url = `${BLOCKCYPHER_API}/addrs/${address}/balance${apiToken ? `?token=${apiToken}` : ''}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return {
        balance: data.balance / 100000000,
        unconfirmed: data.unconfirmed_balance / 100000000,
      };
    } catch (error) {
      console.error('[WalletService] Get balance failed:', error);
      return null;
    }
  }
}

export const walletService = new WalletService();
