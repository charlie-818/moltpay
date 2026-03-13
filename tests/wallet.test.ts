import { describe, it, expect, beforeEach } from 'vitest';
import { Keypair } from '@solana/web3.js';
import { WalletManager } from '../src/wallet/WalletManager';
import {
  generateMnemonic,
  validateMnemonic,
  keypairFromMnemonic,
  deriveMultipleKeypairs,
  getDerivationPath,
} from '../src/wallet/HDDerivation';
import {
  createWalletInfo,
  decryptKeypair,
  exportSecretKey,
  importSecretKey,
  isValidWalletInfo,
  serializeWalletInfo,
  deserializeWalletInfo,
} from '../src/wallet/KeyStore';

const TEST_PASSWORD = 'test-password-123';

describe('HDDerivation', () => {
  describe('generateMnemonic', () => {
    it('should generate a valid 12-word mnemonic by default', () => {
      const mnemonic = generateMnemonic();
      const words = mnemonic.split(' ');
      expect(words).toHaveLength(12);
      expect(validateMnemonic(mnemonic)).toBe(true);
    });

    it('should generate a valid 24-word mnemonic with strength 256', () => {
      const mnemonic = generateMnemonic(256);
      const words = mnemonic.split(' ');
      expect(words).toHaveLength(24);
      expect(validateMnemonic(mnemonic)).toBe(true);
    });
  });

  describe('validateMnemonic', () => {
    it('should return true for valid mnemonics', () => {
      const mnemonic = generateMnemonic();
      expect(validateMnemonic(mnemonic)).toBe(true);
    });

    it('should return false for invalid mnemonics', () => {
      expect(validateMnemonic('invalid mnemonic phrase')).toBe(false);
      expect(validateMnemonic('')).toBe(false);
    });
  });

  describe('keypairFromMnemonic', () => {
    it('should derive consistent keypairs from the same mnemonic', () => {
      const mnemonic = generateMnemonic();
      const keypair1 = keypairFromMnemonic(mnemonic, 0);
      const keypair2 = keypairFromMnemonic(mnemonic, 0);

      expect(keypair1.publicKey.toBase58()).toBe(keypair2.publicKey.toBase58());
    });

    it('should derive different keypairs for different account indices', () => {
      const mnemonic = generateMnemonic();
      const keypair0 = keypairFromMnemonic(mnemonic, 0);
      const keypair1 = keypairFromMnemonic(mnemonic, 1);

      expect(keypair0.publicKey.toBase58()).not.toBe(keypair1.publicKey.toBase58());
    });

    it('should throw for invalid mnemonics', () => {
      expect(() => keypairFromMnemonic('invalid', 0)).toThrow('Invalid mnemonic phrase');
    });
  });

  describe('deriveMultipleKeypairs', () => {
    it('should derive the correct number of keypairs', () => {
      const mnemonic = generateMnemonic();
      const keypairs = deriveMultipleKeypairs(mnemonic, 5);

      expect(keypairs).toHaveLength(5);
    });

    it('should derive unique keypairs', () => {
      const mnemonic = generateMnemonic();
      const keypairs = deriveMultipleKeypairs(mnemonic, 3);
      const publicKeys = keypairs.map(k => k.publicKey.toBase58());
      const uniqueKeys = new Set(publicKeys);

      expect(uniqueKeys.size).toBe(3);
    });
  });

  describe('getDerivationPath', () => {
    it('should return correct derivation paths', () => {
      expect(getDerivationPath(0)).toBe("m/44'/501'/0'/0'");
      expect(getDerivationPath(1)).toBe("m/44'/501'/1'/0'");
      expect(getDerivationPath(5)).toBe("m/44'/501'/5'/0'");
    });
  });
});

describe('KeyStore', () => {
  describe('createWalletInfo', () => {
    it('should create encrypted wallet info', () => {
      const keypair = Keypair.generate();
      const walletInfo = createWalletInfo(keypair, TEST_PASSWORD);

      expect(walletInfo.publicKey).toBe(keypair.publicKey.toBase58());
      expect(walletInfo.encryptedPrivateKey).toBeTruthy();
      expect(walletInfo.iv).toBeTruthy();
      expect(walletInfo.salt).toBeTruthy();
      expect(walletInfo.createdAt).toBeGreaterThan(0);
    });
  });

  describe('decryptKeypair', () => {
    it('should decrypt wallet info back to keypair', () => {
      const originalKeypair = Keypair.generate();
      const walletInfo = createWalletInfo(originalKeypair, TEST_PASSWORD);
      const decrypted = decryptKeypair(walletInfo, TEST_PASSWORD);

      expect(decrypted.publicKey.toBase58()).toBe(originalKeypair.publicKey.toBase58());
      expect(Buffer.from(decrypted.secretKey).toString('hex'))
        .toBe(Buffer.from(originalKeypair.secretKey).toString('hex'));
    });

    it('should throw with wrong password', () => {
      const keypair = Keypair.generate();
      const walletInfo = createWalletInfo(keypair, TEST_PASSWORD);

      expect(() => decryptKeypair(walletInfo, 'wrong-password')).toThrow();
    });
  });

  describe('exportSecretKey / importSecretKey', () => {
    it('should export and import keypairs', () => {
      const original = Keypair.generate();
      const exported = exportSecretKey(original);
      const imported = importSecretKey(exported);

      expect(imported.publicKey.toBase58()).toBe(original.publicKey.toBase58());
    });
  });

  describe('isValidWalletInfo', () => {
    it('should validate correct wallet info', () => {
      const walletInfo = createWalletInfo(Keypair.generate(), TEST_PASSWORD);
      expect(isValidWalletInfo(walletInfo)).toBe(true);
    });

    it('should reject invalid wallet info', () => {
      expect(isValidWalletInfo(null)).toBe(false);
      expect(isValidWalletInfo({})).toBe(false);
      expect(isValidWalletInfo({ publicKey: 'test' })).toBe(false);
    });
  });

  describe('serializeWalletInfo / deserializeWalletInfo', () => {
    it('should serialize and deserialize wallet info', () => {
      const walletInfo = createWalletInfo(Keypair.generate(), TEST_PASSWORD);
      const json = serializeWalletInfo(walletInfo);
      const deserialized = deserializeWalletInfo(json);

      expect(deserialized.publicKey).toBe(walletInfo.publicKey);
      expect(deserialized.encryptedPrivateKey).toBe(walletInfo.encryptedPrivateKey);
    });
  });
});

describe('WalletManager', () => {
  let manager: WalletManager;

  beforeEach(() => {
    manager = new WalletManager({
      encryptionKey: TEST_PASSWORD,
    });
  });

  describe('createWallet', () => {
    it('should create a new wallet', () => {
      const wallet = manager.createWallet();

      expect(wallet.publicKey).toBeTruthy();
      expect(wallet.encryptedPrivateKey).toBeTruthy();
      expect(wallet.salt).toBeTruthy();
    });
  });

  describe('createHDWallet', () => {
    it('should create an HD wallet with mnemonic', () => {
      const { wallet, mnemonic } = manager.createHDWallet();

      expect(wallet.publicKey).toBeTruthy();
      expect(mnemonic.split(' ')).toHaveLength(12);
      expect(wallet.derivationPath).toBe("m/44'/501'/0'/0'");
    });
  });

  describe('importFromMnemonic', () => {
    it('should import wallet from mnemonic', () => {
      const { mnemonic } = manager.createHDWallet();
      const imported = manager.importFromMnemonic(mnemonic, 0);

      // Importing same mnemonic should produce same public key
      const { wallet } = manager.createHDWallet({ mnemonic });
      expect(imported.publicKey).toBe(wallet.publicKey);
    });
  });

  describe('decryptWallet', () => {
    it('should decrypt a wallet', () => {
      const wallet = manager.createWallet();
      const keypair = manager.decryptWallet(wallet);

      expect(keypair.publicKey.toBase58()).toBe(wallet.publicKey);
    });
  });

  describe('deriveMultipleWallets', () => {
    it('should derive multiple wallets from mnemonic', () => {
      const mnemonic = generateMnemonic();
      const wallets = manager.deriveMultipleWallets(mnemonic, 3);

      expect(wallets).toHaveLength(3);
      const publicKeys = wallets.map(w => w.publicKey);
      expect(new Set(publicKeys).size).toBe(3);
    });
  });
});
