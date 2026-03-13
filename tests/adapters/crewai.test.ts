import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CrewAITool, CREWAI_TOOL_SCHEMAS } from '../../src/adapters/crewai';

const TEST_ENCRYPTION_KEY = 'test-encryption-key-32-chars-!!';

// Mock the Solana connection and wallet manager
vi.mock('@solana/web3.js', async () => {
  const actual = await vi.importActual('@solana/web3.js');
  return {
    ...actual,
    Connection: vi.fn().mockImplementation(() => ({
      getBalance: vi.fn().mockResolvedValue(1000000000), // 1 SOL in lamports
      getLatestBlockhash: vi.fn().mockResolvedValue({
        blockhash: 'test-blockhash',
        lastValidBlockHeight: 100,
      }),
    })),
  };
});

describe('CrewAITool', () => {
  let tool: CrewAITool;

  beforeEach(() => {
    tool = new CrewAITool({
      encryptionKey: TEST_ENCRYPTION_KEY,
      network: 'devnet',
    });
  });

  describe('constructor', () => {
    it('should create a CrewAI tool instance', () => {
      expect(tool).toBeInstanceOf(CrewAITool);
    });

    it('should initialize with devnet by default', () => {
      const toolWithDefaults = new CrewAITool({
        encryptionKey: TEST_ENCRYPTION_KEY,
      });
      expect(toolWithDefaults).toBeInstanceOf(CrewAITool);
    });
  });

  describe('createWallet', () => {
    it('should create a wallet and return JSON string', async () => {
      const result = await tool.createWallet();
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.data).toBeDefined();
      expect(parsed.data.publicKey).toBeDefined();
      expect(typeof parsed.data.publicKey).toBe('string');
      expect(parsed.data.publicKey.length).toBeGreaterThan(30);
      expect(parsed.data.createdAt).toBeDefined();
      expect(typeof parsed.data.createdAt).toBe('number');
    });

    it('should set the active wallet', async () => {
      await tool.createWallet();
      expect(tool.getActiveWalletPublicKey()).toBeDefined();
    });
  });

  describe('getBalance', () => {
    it('should return JSON string with balance', async () => {
      // Create wallet first
      const walletResult = await tool.createWallet();
      const wallet = JSON.parse(walletResult);

      const result = await tool.getBalance({
        publicKey: wallet.data.publicKey,
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.data).toBeDefined();
      expect(typeof parsed.data.sol).toBe('number');
      expect(Array.isArray(parsed.data.tokens)).toBe(true);
    });
  });

  describe('sendPayment', () => {
    it('should return error if no active wallet', async () => {
      const result = await tool.sendPayment({
        to: 'FakeRecipientAddress123456789012345678901234',
        amount: 0.1,
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('No active wallet');
    });
  });

  describe('verifyPayment', () => {
    it('should return JSON string for verification result', async () => {
      // This will fail to verify since it's a fake signature, but should not throw
      const result = await tool.verifyPayment({
        signature: '5wFnC7GJ4Wz9qCr5NJYXeT8N1UQ3a8bPQ5mJq6KfRzNJH1K8vJQWqXPLBZRyVKm8Q2WwPQXrJvWsQJZx9nZbRzpN',
      });
      const parsed = JSON.parse(result);

      // Will fail because signature doesn't exist, but should return valid JSON
      expect(parsed).toBeDefined();
      expect(typeof parsed.success).toBe('boolean');
    });
  });

  describe('requestAirdrop', () => {
    it('should return error for mainnet', async () => {
      const mainnetTool = new CrewAITool({
        encryptionKey: TEST_ENCRYPTION_KEY,
        network: 'mainnet-beta',
      });

      const result = await mainnetTool.requestAirdrop({
        publicKey: 'FakeAddress123456789012345678901234567',
        amount: 1,
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('not available on mainnet');
    });
  });

  describe('getToolFunctions', () => {
    it('should return tool functions object', () => {
      const functions = tool.getToolFunctions();

      expect(functions).toBeDefined();
      expect(typeof functions.moltpay_create_wallet).toBe('function');
      expect(typeof functions.moltpay_get_balance).toBe('function');
      expect(typeof functions.moltpay_send_payment).toBe('function');
      expect(typeof functions.moltpay_verify_payment).toBe('function');
      expect(typeof functions.moltpay_get_history).toBe('function');
      expect(typeof functions.moltpay_request_airdrop).toBe('function');
    });

    it('should execute tool functions with JSON input', async () => {
      const functions = tool.getToolFunctions();

      // Create wallet
      const createResult = await functions.moltpay_create_wallet('{}');
      const wallet = JSON.parse(createResult);
      expect(wallet.success).toBe(true);

      // Get balance
      const balanceResult = await functions.moltpay_get_balance(
        JSON.stringify({ publicKey: wallet.data.publicKey })
      );
      const balance = JSON.parse(balanceResult);
      expect(balance.success).toBe(true);
    });
  });

  describe('executeTool', () => {
    it('should execute tool by name', async () => {
      const result = await tool.executeTool('moltpay_create_wallet', '{}');
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.data.publicKey).toBeDefined();
    });

    it('should return error for unknown tool', async () => {
      const result = await tool.executeTool('unknown_tool', '{}');
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('Unknown tool');
    });
  });

  describe('getToolSchemas', () => {
    it('should return tool schemas', () => {
      const schemas = CrewAITool.getToolSchemas();

      expect(schemas).toBeDefined();
      expect(schemas.create_wallet).toBeDefined();
      expect(schemas.get_balance).toBeDefined();
      expect(schemas.send_payment).toBeDefined();
      expect(schemas.verify_payment).toBeDefined();
      expect(schemas.get_history).toBeDefined();
      expect(schemas.request_airdrop).toBeDefined();
    });
  });
});

describe('CREWAI_TOOL_SCHEMAS', () => {
  it('should have correct schema structure', () => {
    expect(CREWAI_TOOL_SCHEMAS.create_wallet).toBeDefined();
    expect(CREWAI_TOOL_SCHEMAS.create_wallet.name).toBe('moltpay_create_wallet');
    expect(CREWAI_TOOL_SCHEMAS.create_wallet.description).toBeDefined();
    expect(CREWAI_TOOL_SCHEMAS.create_wallet.args_schema).toBeDefined();
  });

  it('should have required fields in send_payment schema', () => {
    const schema = CREWAI_TOOL_SCHEMAS.send_payment;

    expect(schema.args_schema.required).toContain('to');
    expect(schema.args_schema.required).toContain('amount');
    expect(schema.args_schema.properties.to).toBeDefined();
    expect(schema.args_schema.properties.amount).toBeDefined();
    expect(schema.args_schema.properties.token).toBeDefined();
    expect(schema.args_schema.properties.memo).toBeDefined();
  });

  it('should have direction enum in get_history schema', () => {
    const schema = CREWAI_TOOL_SCHEMAS.get_history;

    expect(schema.args_schema.properties.direction.enum).toEqual(['sent', 'received', 'all']);
  });
});
