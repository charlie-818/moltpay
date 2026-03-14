import React from 'react';
import { cn } from '../lib/utils';
import { SkillViewer } from '../components/SkillViewer';
import { MCPInstaller } from '../components/MCPInstaller';
import {
  Github,
  Wallet,
  ArrowRightLeft,
  ShieldCheck,
  ExternalLink,
} from 'lucide-react';

// Import SKILL.md content - will be handled by vite config
import skillContent from '../../adapters/openclaw/SKILL.md?raw';

export interface LandingPageProps {
  className?: string;
}

const features = [
  {
    icon: Wallet,
    title: 'Wallet Management',
    description: 'Create and manage encrypted Solana wallets for your AI agents',
  },
  {
    icon: ArrowRightLeft,
    title: 'SOL Transfers',
    description: 'Send SOL payments with transaction confirmation and receipts',
  },
  {
    icon: ShieldCheck,
    title: 'Payment Verification',
    description: 'Verify on-chain payments and transaction history',
  },
];

export function LandingPage({ className }: LandingPageProps) {
  return (
    <div className={cn('min-h-screen flex flex-col', className)}>
      {/* Header */}
      <header className="sticky top-0 z-20 flex-shrink-0 bg-black border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/moltpaylogo.png" alt="MoltPay" className="h-9 w-auto" />
            <span className="text-xl font-bold text-white">MoltPay</span>
          </div>
          <a
            href="https://github.com/charlie-818/moltpay"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          >
            <Github size={18} />
            GitHub
          </a>
        </div>
      </header>

      {/* Hero Section */}
      <section className="flex-shrink-0 bg-gradient-to-br from-red-600 via-red-700 to-red-800 text-white">
        <div className="max-w-6xl mx-auto px-6 py-16 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Solana Payments for AI Agents
          </h1>
          <p className="text-xl text-red-100 max-w-2xl mx-auto mb-8">
            Give your AI the ability to send SOL, manage wallets, and verify transactions on Solana.
            Works with Claude Desktop, LangChain, and any MCP-compatible agent.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <a
              href="https://github.com/charlie-818/moltpay"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 bg-red-500/20 text-white font-semibold rounded-lg border border-red-400/30 hover:bg-red-500/30 transition-colors"
            >
              <Github size={18} />
              View on GitHub
              <ExternalLink size={14} />
            </a>
          </div>
        </div>
      </section>

      {/* Main Content - Two Column Layout */}
      <main className="flex-1 bg-gray-50 py-12">
        <div className="max-w-6xl mx-auto px-6">
          {/* Features Section */}
          <section className="mb-16">
            <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">
              Features
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {features.map((feature) => (
                <div
                  key={feature.title}
                  className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-shadow"
                >
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-red-100 to-red-200 flex items-center justify-center mb-4">
                    <feature.icon size={24} className="text-red-600" />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2">{feature.title}</h3>
                  <p className="text-sm text-gray-600">{feature.description}</p>
                </div>
              ))}
            </div>
          </section>

          <div id="install" className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
            {/* SKILL.md Viewer - fixed height to match Install MCP card */}
            <div className="flex flex-col w-full lg:h-[720px] min-h-0">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex-shrink-0">
                For AI Agents
              </h2>
              <div className="flex-1 min-h-0 flex flex-col min-w-0">
                <SkillViewer content={skillContent} className="h-full flex flex-col min-h-0 overflow-hidden" />
              </div>
            </div>

            {/* MCP Installer - same height as AI agents card */}
            <div className="flex flex-col w-full lg:h-[720px] min-h-0">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex-shrink-0">
                Install MCP Server
              </h2>
              <div className="flex-1 min-h-0 flex flex-col min-w-0">
                <MCPInstaller className="h-full flex flex-col min-h-0" />
              </div>
            </div>
          </div>

          {/* FAQ - structured for human readability and AI parsing */}
          <section id="faq" className="mt-16 mb-16" aria-label="Frequently asked questions">
            <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">
              FAQ
            </h2>
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div itemScope itemType="https://schema.org/Question" className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-shadow">
                <dt className="font-semibold text-gray-900 mb-2" itemProp="name">What is MoltPay?</dt>
                <dd className="text-gray-600 text-sm pl-0" itemScope itemProp="acceptedAnswer" itemType="https://schema.org/Answer">
                  <span itemProp="text">MoltPay is an MCP server that gives AI agents the ability to manage Solana wallets, send SOL, and verify on-chain payments. It works with Claude Desktop, LangChain, and any MCP-compatible client.</span>
                </dd>
              </div>
              <div itemScope itemType="https://schema.org/Question" className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-shadow">
                <dt className="font-semibold text-gray-900 mb-2" itemProp="name">How do I install it?</dt>
                <dd className="text-gray-600 text-sm pl-0" itemScope itemProp="acceptedAnswer" itemType="https://schema.org/Answer">
                  <span itemProp="text">Add the MCP server to your client config (e.g. Claude Desktop or Cursor). Use the config snippet above: set the command to <code className="bg-gray-200 px-1 rounded">npx</code> and args to <code className="bg-gray-200 px-1 rounded">moltpay</code>. No API keys required for basic use.</span>
                </dd>
              </div>
              <div itemScope itemType="https://schema.org/Question" className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-shadow">
                <dt className="font-semibold text-gray-900 mb-2" itemProp="name">Where are wallets stored? Are they secure?</dt>
                <dd className="text-gray-600 text-sm pl-0" itemScope itemProp="acceptedAnswer" itemType="https://schema.org/Answer">
                  <span itemProp="text">Wallets are stored locally and encrypted. Keys never leave your machine unless you export them. Use a strong passphrase and keep backups safe.</span>
                </dd>
              </div>
              <div itemScope itemType="https://schema.org/Question" className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-shadow">
                <dt className="font-semibold text-gray-900 mb-2" itemProp="name">What can the agent do with MoltPay?</dt>
                <dd className="text-gray-600 text-sm pl-0" itemScope itemProp="acceptedAnswer" itemType="https://schema.org/Answer">
                  <span itemProp="text">Create/list wallets, send SOL to addresses, verify that a payment was received, and check transaction history. All actions require your confirmation (or auto-confirm if configured).</span>
                </dd>
              </div>
              <div itemScope itemType="https://schema.org/Question" className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-shadow">
                <dt className="font-semibold text-gray-900 mb-2" itemProp="name">Which networks are supported?</dt>
                <dd className="text-gray-600 text-sm pl-0" itemScope itemProp="acceptedAnswer" itemType="https://schema.org/Answer">
                  <span itemProp="text">Solana mainnet and devnet. Configure via environment or MCP server args if you need devnet.</span>
                </dd>
              </div>
              <div itemScope itemType="https://schema.org/Question" className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-shadow">
                <dt className="font-semibold text-gray-900 mb-2" itemProp="name">Does it work with Cursor / Claude Desktop / LangChain?</dt>
                <dd className="text-gray-600 text-sm pl-0" itemScope itemProp="acceptedAnswer" itemType="https://schema.org/Answer">
                  <span itemProp="text">Yes. Any client that supports MCP can use MoltPay. For LangChain, use the MoltPay MCP tool adapter in your agent setup.</span>
                </dd>
              </div>
              <div itemScope itemType="https://schema.org/Question" className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-shadow">
                <dt className="font-semibold text-gray-900 mb-2" itemProp="name">Is there a fee or subscription?</dt>
                <dd className="text-gray-600 text-sm pl-0" itemScope itemProp="acceptedAnswer" itemType="https://schema.org/Answer">
                  <span itemProp="text">MoltPay is free and open source (MIT). You only pay Solana network fees (rent, transaction fees) when sending SOL.</span>
                </dd>
              </div>
              <div itemScope itemType="https://schema.org/Question" className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-shadow">
                <dt className="font-semibold text-gray-900 mb-2" itemProp="name">Where can I get help or report issues?</dt>
                <dd className="text-gray-600 text-sm pl-0" itemScope itemProp="acceptedAnswer" itemType="https://schema.org/Answer">
                  <span itemProp="text">Open an issue or discussion on GitHub: github.com/charlie-818/moltpay.</span>
                </dd>
              </div>
            </dl>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="flex-shrink-0 bg-black border-t border-gray-800">
        <div className="max-w-6xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <span>MIT License</span>
            <span className="text-gray-600">|</span>
            <span>MoltPay</span>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/charlie-818/moltpay"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-white transition-colors"
            >
              <Github size={20} />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
