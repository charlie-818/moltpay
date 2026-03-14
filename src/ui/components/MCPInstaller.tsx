import React, { useState } from 'react';
import { cn } from '../lib/utils';
import { Copy, Check, Terminal, Apple, Monitor } from 'lucide-react';

const MCP_CONFIG = {
  mcpServers: {
    moltpay: {
      command: "npx",
      args: ["moltpay-mcp"],
      env: {
        MOLTPAY_ENCRYPTION_KEY: "your-encryption-key-here",
        MOLTPAY_RPC_ENDPOINT: "https://api.devnet.solana.com"
      }
    }
  }
};

const CONFIG_PATHS = {
  macOS: '~/Library/Application Support/Claude/claude_desktop_config.json',
  Windows: '%APPDATA%\\Claude\\claude_desktop_config.json'
};

export interface MCPInstallerProps {
  className?: string;
  onCopy?: () => void;
}

export function MCPInstaller({ className, onCopy }: MCPInstallerProps) {
  const [copiedConfig, setCopiedConfig] = useState(false);
  const [copiedNpx, setCopiedNpx] = useState(false);
  const [activeTab, setActiveTab] = useState<'config' | 'npx'>('config');

  const configJson = JSON.stringify(MCP_CONFIG, null, 2);

  const handleCopyConfig = async () => {
    try {
      await navigator.clipboard.writeText(configJson);
      setCopiedConfig(true);
      onCopy?.();
      setTimeout(() => setCopiedConfig(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleCopyNpx = async () => {
    try {
      await navigator.clipboard.writeText('npx moltpay-mcp');
      setCopiedNpx(true);
      onCopy?.();
      setTimeout(() => setCopiedNpx(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className={cn('bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col min-h-0', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center">
            <Terminal size={20} className="text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Install MCP Server</h3>
            <p className="text-sm text-gray-500">Add MoltPay to Claude Desktop</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 flex-shrink-0">
        <button
          onClick={() => setActiveTab('config')}
          className={cn(
            'flex-1 px-4 py-3 text-sm font-medium transition-colors',
            activeTab === 'config'
              ? 'text-red-600 border-b-2 border-red-600 bg-red-50/50'
              : 'text-gray-500 hover:text-gray-700'
          )}
        >
          JSON Config
        </button>
        <button
          onClick={() => setActiveTab('npx')}
          className={cn(
            'flex-1 px-4 py-3 text-sm font-medium transition-colors',
            activeTab === 'npx'
              ? 'text-red-600 border-b-2 border-red-600 bg-red-50/50'
              : 'text-gray-500 hover:text-gray-700'
          )}
        >
          npx Command
        </button>
      </div>

      {/* Content */}
      <div className="p-6 flex-1 min-h-0">
        {activeTab === 'config' ? (
          <>
            <div className="flex flex-col gap-4 flex-1 min-h-0">
              {/* Config file location - above config text */}
              <div className="flex-shrink-0 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-sm font-medium text-gray-700 mb-2">Config file location:</p>
                <div className="flex flex-col gap-2 text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <Apple size={14} className="flex-shrink-0" />
                    <code className="px-2 py-1 bg-gray-100 rounded text-xs break-all">{CONFIG_PATHS.macOS}</code>
                  </div>
                  <div className="flex items-center gap-2">
                    <Monitor size={14} className="flex-shrink-0" />
                    <code className="px-2 py-1 bg-gray-100 rounded text-xs break-all">{CONFIG_PATHS.Windows}</code>
                  </div>
                </div>
              </div>

              {/* JSON config */}
              <div className="relative flex-1 min-w-0 flex flex-col">
                <pre className="flex-1 p-4 bg-gray-900 rounded-lg text-sm text-gray-100 font-mono overflow-x-auto">
                  {configJson}
                </pre>
                <button
                  onClick={handleCopyConfig}
                  className={cn(
                    'absolute top-3 right-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all',
                    copiedConfig
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                  )}
                >
                  {copiedConfig ? (
                    <>
                      <Check size={12} />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy size={12} />
                      Copy
                    </>
                  )}
                </button>
              </div>
            </div>

            <p className="mt-4 text-sm text-gray-500">
              Add this to your Claude Desktop config file, then restart Claude.
            </p>
          </>
        ) : (
          <>
            {/* npx command */}
            <p className="text-sm text-gray-600 mb-4">
              Run the MCP server directly with npx:
            </p>
            <div className="relative">
              <pre className="p-4 bg-gray-900 rounded-lg text-sm text-green-400 font-mono">
                $ npx moltpay-mcp
              </pre>
              <button
                onClick={handleCopyNpx}
                className={cn(
                  'absolute top-3 right-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all',
                  copiedNpx
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                )}
              >
                {copiedNpx ? (
                  <>
                    <Check size={12} />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy size={12} />
                    Copy
                  </>
                )}
              </button>
            </div>

            <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm text-amber-800">
                <strong>Note:</strong> Set environment variables before running:
              </p>
              <pre className="mt-2 text-xs text-amber-700 font-mono whitespace-pre">
{`export MOLTPAY_ENCRYPTION_KEY="your-key-here"
export MOLTPAY_RPC_ENDPOINT="https://api.devnet.solana.com"`}
              </pre>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
