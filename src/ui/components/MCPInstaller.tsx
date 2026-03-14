import React, { useState } from 'react';
import { cn } from '../lib/utils';
import { Copy, Check, Terminal, Apple, Monitor } from 'lucide-react';

// Simple JSON syntax highlighter
function highlightJson(json: string): React.ReactNode[] {
  const lines = json.split('\n');
  return lines.map((line, lineIndex) => {
    const parts: React.ReactNode[] = [];
    let remaining = line;
    let keyIndex = 0;

    // Match patterns in order
    while (remaining.length > 0) {
      // Leading whitespace
      const wsMatch = remaining.match(/^(\s+)/);
      if (wsMatch) {
        parts.push(wsMatch[1]);
        remaining = remaining.slice(wsMatch[1].length);
        continue;
      }

      // Key (quoted string followed by colon)
      const keyMatch = remaining.match(/^("(?:[^"\\]|\\.)*")(\s*:\s*)/);
      if (keyMatch) {
        parts.push(
          <span key={`k-${lineIndex}-${keyIndex++}`} className="text-purple-400">{keyMatch[1]}</span>
        );
        parts.push(
          <span key={`c-${lineIndex}-${keyIndex++}`} className="text-gray-400">{keyMatch[2]}</span>
        );
        remaining = remaining.slice(keyMatch[0].length);
        continue;
      }

      // String value
      const strMatch = remaining.match(/^("(?:[^"\\]|\\.)*")/);
      if (strMatch) {
        parts.push(
          <span key={`s-${lineIndex}-${keyIndex++}`} className="text-green-400">{strMatch[1]}</span>
        );
        remaining = remaining.slice(strMatch[1].length);
        continue;
      }

      // Braces and brackets
      const braceMatch = remaining.match(/^([{}\[\]])/);
      if (braceMatch) {
        parts.push(
          <span key={`b-${lineIndex}-${keyIndex++}`} className="text-yellow-300">{braceMatch[1]}</span>
        );
        remaining = remaining.slice(1);
        continue;
      }

      // Comma
      if (remaining[0] === ',') {
        parts.push(
          <span key={`cm-${lineIndex}-${keyIndex++}`} className="text-gray-400">,</span>
        );
        remaining = remaining.slice(1);
        continue;
      }

      // Numbers
      const numMatch = remaining.match(/^(-?\d+\.?\d*)/);
      if (numMatch) {
        parts.push(
          <span key={`n-${lineIndex}-${keyIndex++}`} className="text-cyan-400">{numMatch[1]}</span>
        );
        remaining = remaining.slice(numMatch[1].length);
        continue;
      }

      // Boolean/null
      const boolMatch = remaining.match(/^(true|false|null)/);
      if (boolMatch) {
        parts.push(
          <span key={`bl-${lineIndex}-${keyIndex++}`} className="text-orange-400">{boolMatch[1]}</span>
        );
        remaining = remaining.slice(boolMatch[1].length);
        continue;
      }

      // Fallback: single character
      parts.push(remaining[0]);
      remaining = remaining.slice(1);
    }

    return (
      <React.Fragment key={`line-${lineIndex}`}>
        {parts}
        {lineIndex < lines.length - 1 && '\n'}
      </React.Fragment>
    );
  });
}

type NetworkType = 'devnet' | 'mainnet';

const NETWORK_CONFIG = {
  devnet: {
    rpcEndpoint: 'https://api.devnet.solana.com',
    network: 'devnet',
    label: 'Devnet',
    description: 'Test network with free SOL'
  },
  mainnet: {
    rpcEndpoint: 'https://api.mainnet-beta.solana.com',
    network: 'mainnet-beta',
    label: 'Mainnet',
    description: 'Live network with real SOL'
  }
};

const getMcpConfig = (network: NetworkType) => ({
  mcpServers: {
    moltpay: {
      command: "npx",
      args: ["moltpay-mcp"],
      env: {
        MOLTPAY_ENCRYPTION_KEY: "your-encryption-key-here",
        MOLTPAY_NETWORK: NETWORK_CONFIG[network].network,
        MOLTPAY_RPC_ENDPOINT: NETWORK_CONFIG[network].rpcEndpoint
      }
    }
  }
});

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
  const [network, setNetwork] = useState<NetworkType>('devnet');

  const configJson = JSON.stringify(getMcpConfig(network), null, 2);

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
              {/* Network selector */}
              <div className="flex-shrink-0">
                <p className="text-sm font-medium text-gray-700 mb-2">Select network:</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setNetwork('devnet')}
                    className={cn(
                      'flex-1 px-4 py-3 rounded-lg border-2 transition-all text-left',
                      network === 'devnet'
                        ? 'border-red-500 bg-red-50'
                        : 'border-gray-200 hover:border-gray-300'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        'w-3 h-3 rounded-full',
                        network === 'devnet' ? 'bg-red-500' : 'bg-gray-300'
                      )} />
                      <span className="font-medium text-gray-900">Devnet</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Test network with free SOL</p>
                  </button>
                  <button
                    onClick={() => setNetwork('mainnet')}
                    className={cn(
                      'flex-1 px-4 py-3 rounded-lg border-2 transition-all text-left',
                      network === 'mainnet'
                        ? 'border-green-500 bg-green-50'
                        : 'border-gray-200 hover:border-gray-300'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        'w-3 h-3 rounded-full',
                        network === 'mainnet' ? 'bg-green-500' : 'bg-gray-300'
                      )} />
                      <span className="font-medium text-gray-900">Mainnet</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Live network with real SOL</p>
                  </button>
                </div>
                {network === 'mainnet' && (
                  <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-xs text-amber-800">
                      <strong>Warning:</strong> Mainnet uses real SOL. Transactions are irreversible and cost real money.
                    </p>
                  </div>
                )}
              </div>

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
                <pre className="flex-1 p-4 bg-gray-900 rounded-lg text-sm font-mono overflow-x-auto">
                  <code>{highlightJson(configJson)}</code>
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

            <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <p className="text-sm text-gray-700 font-medium mb-2">
                Set environment variables before running:
              </p>
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => setNetwork('devnet')}
                  className={cn(
                    'px-3 py-1.5 rounded text-xs font-medium transition-all',
                    network === 'devnet'
                      ? 'bg-red-500 text-white'
                      : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                  )}
                >
                  Devnet
                </button>
                <button
                  onClick={() => setNetwork('mainnet')}
                  className={cn(
                    'px-3 py-1.5 rounded text-xs font-medium transition-all',
                    network === 'mainnet'
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                  )}
                >
                  Mainnet
                </button>
              </div>
              <pre className="text-xs text-gray-700 font-mono whitespace-pre bg-gray-100 p-3 rounded">
{`export MOLTPAY_ENCRYPTION_KEY="your-key-here"
export MOLTPAY_NETWORK="${NETWORK_CONFIG[network].network}"
export MOLTPAY_RPC_ENDPOINT="${NETWORK_CONFIG[network].rpcEndpoint}"`}
              </pre>
              {network === 'mainnet' && (
                <p className="mt-2 text-xs text-amber-700">
                  <strong>Warning:</strong> Mainnet uses real SOL. Transactions are irreversible.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
