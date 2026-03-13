import React, { useState } from 'react';
import { cn } from '../lib/utils';
import * as Tabs from '@radix-ui/react-tabs';
import {
  Terminal,
  Code,
  Copy,
  Check,
  User,
  Bot,
  FileText,
  Settings,
  Shield,
  Rocket,
  ChevronRight,
  Package,
  Key,
  Wallet,
  Send,
  CheckCircle,
} from 'lucide-react';

export interface DeployGuideProps {
  className?: string;
}

// CodeBlock component with copy-to-clipboard
function CodeBlock({
  code,
  language = 'typescript',
  filename,
}: {
  code: string;
  language?: string;
  filename?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group rounded-lg overflow-hidden border border-gray-700">
      {filename && (
        <div className="bg-gray-800 px-4 py-2 text-xs text-gray-400 border-b border-gray-700 flex items-center gap-2">
          <FileText size={12} />
          {filename}
        </div>
      )}
      <pre className="bg-gray-900 text-gray-100 p-4 overflow-x-auto text-sm">
        <code className={`language-${language}`}>{code}</code>
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-2 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
    </div>
  );
}

// StepCard component
function StepCard({
  step,
  title,
  description,
  children,
  icon: Icon,
}: {
  step: number;
  title: string;
  description?: string;
  children: React.ReactNode;
  icon: typeof Terminal;
}) {
  return (
    <div className="p-6 rounded-lg border border-gray-200 bg-white">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-semibold text-sm">
          {step}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <Icon size={18} className="text-gray-500" />
            <h3 className="font-semibold text-gray-900">{title}</h3>
          </div>
          {description && (
            <p className="text-sm text-gray-500 mb-4">{description}</p>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

// PermissionTable component
function PermissionTable() {
  const permissions = [
    { scope: 'file_read', description: 'Read files from filesystem', risk: 'Low' },
    { scope: 'file_write', description: 'Write files to filesystem', risk: 'Medium' },
    { scope: 'network_fetch', description: 'Make HTTP requests', risk: 'Medium' },
    { scope: 'network_connect', description: 'WebSocket connections', risk: 'Medium' },
    { scope: 'wallet_read', description: 'View wallet balance', risk: 'Low' },
    { scope: 'wallet_sign', description: 'Sign transactions', risk: 'High' },
    { scope: 'wallet_send', description: 'Send funds', risk: 'High' },
    { scope: 'system_exec', description: 'Execute system commands', risk: 'High' },
  ];

  const riskColors = {
    Low: 'bg-green-100 text-green-700',
    Medium: 'bg-yellow-100 text-yellow-700',
    High: 'bg-red-100 text-red-600',
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left py-3 px-4 font-medium text-gray-700">Scope</th>
            <th className="text-left py-3 px-4 font-medium text-gray-700">Description</th>
            <th className="text-left py-3 px-4 font-medium text-gray-700">Risk</th>
          </tr>
        </thead>
        <tbody>
          {permissions.map((perm) => (
            <tr key={perm.scope} className="border-b border-gray-100">
              <td className="py-3 px-4">
                <code className="px-2 py-1 bg-gray-100 rounded text-xs font-mono">
                  {perm.scope}
                </code>
              </td>
              <td className="py-3 px-4 text-gray-600">{perm.description}</td>
              <td className="py-3 px-4">
                <span
                  className={cn(
                    'px-2 py-1 rounded-full text-xs font-medium',
                    riskColors[perm.risk as keyof typeof riskColors]
                  )}
                >
                  {perm.risk}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// UserGuide component (For Developers)
function UserGuide() {
  return (
    <div className="space-y-4">
      <StepCard
        step={1}
        title="Installation"
        description="Install MoltPay from npm"
        icon={Package}
      >
        <CodeBlock code="npm install moltpay" language="bash" />
      </StepCard>

      <StepCard
        step={2}
        title="Environment Setup"
        description="Configure your environment variables"
        icon={Settings}
      >
        <CodeBlock
          code={`# Required
MOLTPAY_ENCRYPTION_KEY=your-32-byte-encryption-key

# Optional
MOLTPAY_RPC_ENDPOINT=https://api.devnet.solana.com
MOLTPAY_RATE_LIMIT=100`}
          language="bash"
          filename=".env"
        />
      </StepCard>

      <StepCard
        step={3}
        title="Initialize SDK"
        description="Create a MoltPay instance"
        icon={Code}
      >
        <CodeBlock
          code={`import { MoltPay } from 'moltpay';

const moltpay = new MoltPay({
  encryptionKey: process.env.MOLTPAY_ENCRYPTION_KEY,
  rpcEndpoint: 'https://api.devnet.solana.com'
});`}
          language="typescript"
        />
      </StepCard>

      <StepCard
        step={4}
        title="Create Wallet"
        description="Generate an encrypted wallet"
        icon={Wallet}
      >
        <CodeBlock
          code={`// Create wallet
const wallet = moltpay.wallet.createWallet();
console.log('Address:', wallet.publicKey);

// Decrypt for signing
const keypair = moltpay.wallet.decryptWallet(wallet);

// Get airdrop (devnet only)
await moltpay.wallet.requestAirdrop(wallet.publicKey, 2);`}
          language="typescript"
        />
      </StepCard>

      <StepCard
        step={5}
        title="Send Transaction"
        description="Build and send a SOL transfer"
        icon={Send}
      >
        <CodeBlock
          code={`const tx = await moltpay.transactions.buildTransfer({
  sender: keypair,
  recipient: 'RecipientPublicKeyHere',
  amount: 1.0,
  token: 'SOL',
  memo: 'Payment for services'
});

const result = await moltpay.sender.signSendAndConfirm(
  tx.transaction,
  [keypair]
);

console.log('Signature:', result.signature);`}
          language="typescript"
        />
      </StepCard>

      <StepCard
        step={6}
        title="Verify Payment"
        description="Confirm the transaction succeeded"
        icon={CheckCircle}
      >
        <CodeBlock
          code={`const verified = await moltpay.verifier.verifyPayment(
  result.signature
);

if (verified.success) {
  console.log('Payment confirmed!');
  console.log('Amount:', verified.amount);
  console.log('Recipient:', verified.recipient);
}`}
          language="typescript"
        />
      </StepCard>
    </div>
  );
}

// AgentGuide component (For AI Agents)
function AgentGuide() {
  return (
    <div className="space-y-4">
      <StepCard
        step={1}
        title="SKILL.md Format"
        description="Define your skill with frontmatter"
        icon={FileText}
      >
        <CodeBlock
          code={`---
name: payment-skill
description: Process Solana payments
version: 1.0.0
permissions:
  - wallet_read
  - wallet_sign
  - wallet_send
trust-level: verified
---

## Payment Skill

This skill enables AI agents to process Solana payments securely.

### Actions

- \`create_wallet\` - Create new wallet
- \`send\` - Send SOL or tokens
- \`verify_payment\` - Verify transaction`}
          language="yaml"
          filename="SKILL.md"
        />
      </StepCard>

      <StepCard
        step={2}
        title="Permission Scopes"
        description="Available permission scopes for skills"
        icon={Shield}
      >
        <PermissionTable />
      </StepCard>

      <StepCard
        step={3}
        title="OpenClaw Integration"
        description="Register your skill with OpenClaw"
        icon={Rocket}
      >
        <CodeBlock
          code={`import { SkillRegistry } from 'openclaw';
import { moltpaySkill } from 'moltpay/openclaw';

const registry = new SkillRegistry();

// Register the MoltPay skill
registry.register(moltpaySkill);

// Execute skill action
const result = await registry.execute('moltpay', 'send', {
  recipient: 'RecipientAddressHere',
  amount: 1.0,
  token: 'SOL'
});`}
          language="typescript"
        />
      </StepCard>

      <StepCard
        step={4}
        title="LangChain Integration"
        description="Use MoltPay as a LangChain tool"
        icon={Terminal}
      >
        <CodeBlock
          code={`import { MoltPayTool } from 'moltpay/langchain';
import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createOpenAIFunctionsAgent } from 'langchain/agents';

const paymentTool = new MoltPayTool({
  encryptionKey: process.env.MOLTPAY_ENCRYPTION_KEY,
});

// Tool schema
// Name: moltpay_send
// Parameters:
//   - recipient: string (required)
//   - amount: number (required)
//   - token: string (default: "SOL")
//   - memo: string (optional)

const tools = [paymentTool];
const agent = await createOpenAIFunctionsAgent({
  llm: new ChatOpenAI(),
  tools,
  prompt
});`}
          language="typescript"
        />
      </StepCard>

      <StepCard
        step={5}
        title="API Reference"
        description="Available actions and parameters"
        icon={Code}
      >
        <div className="space-y-4">
          <div className="p-4 bg-gray-50 rounded-lg">
            <h4 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
              <ChevronRight size={16} />
              create_wallet
            </h4>
            <p className="text-sm text-gray-600 mb-2">Create a new encrypted wallet</p>
            <CodeBlock
              code={`// No parameters required
// Returns: { publicKey: string, encrypted: string }`}
              language="typescript"
            />
          </div>

          <div className="p-4 bg-gray-50 rounded-lg">
            <h4 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
              <ChevronRight size={16} />
              send
            </h4>
            <p className="text-sm text-gray-600 mb-2">Send SOL or SPL tokens</p>
            <CodeBlock
              code={`{
  recipient: string,  // Recipient public key
  amount: number,     // Amount to send
  token: string,      // "SOL" or SPL token mint
  memo?: string       // Optional memo
}
// Returns: { signature: string, success: boolean }`}
              language="typescript"
            />
          </div>

          <div className="p-4 bg-gray-50 rounded-lg">
            <h4 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
              <ChevronRight size={16} />
              verify_payment
            </h4>
            <p className="text-sm text-gray-600 mb-2">Verify a transaction signature</p>
            <CodeBlock
              code={`{
  signature: string   // Transaction signature
}
// Returns: { success: boolean, amount: number, recipient: string }`}
              language="typescript"
            />
          </div>
        </div>
      </StepCard>
    </div>
  );
}

// Main DeployGuide component
export function DeployGuide({ className }: DeployGuideProps) {
  const [activeTab, setActiveTab] = useState('developers');

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Deploy Guide</h2>
            <p className="text-sm text-gray-500">
              Get started with MoltPay for developers and AI agents
            </p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs.Root value={activeTab} onValueChange={setActiveTab} className="mt-4">
          <Tabs.List className="flex gap-1 border-b border-gray-200">
            <Tabs.Trigger
              value="developers"
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors',
                activeTab === 'developers'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              )}
            >
              <User size={16} />
              For Developers
            </Tabs.Trigger>
            <Tabs.Trigger
              value="agents"
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors',
                activeTab === 'agents'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              )}
            >
              <Bot size={16} />
              For AI Agents
            </Tabs.Trigger>
          </Tabs.List>
        </Tabs.Root>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <Tabs.Root value={activeTab}>
          <Tabs.Content value="developers">
            <UserGuide />
          </Tabs.Content>
          <Tabs.Content value="agents">
            <AgentGuide />
          </Tabs.Content>
        </Tabs.Root>
      </div>
    </div>
  );
}
