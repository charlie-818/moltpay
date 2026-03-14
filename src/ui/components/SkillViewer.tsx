import React, { useState } from 'react';
import { cn } from '../lib/utils';
import { TrustBadge } from './TrustBadge';
import { Copy, Check, FileText } from 'lucide-react';

export interface SkillViewerProps {
  content: string;
  className?: string;
  onCopy?: () => void;
}

export function SkillViewer({ content, className, onCopy }: SkillViewerProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      onCopy?.();
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Parse frontmatter for trust badge
  const trustLevel = content.includes('trust-level: verified') ? 'verified' : 'community';

  return (
    <div className={cn('bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col min-h-0', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center">
            <FileText size={20} className="text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">SKILL.md</h3>
            <p className="text-sm text-gray-500">AI-readable skill documentation</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <TrustBadge trustLevel={trustLevel} size="sm" />
          <button
            onClick={handleCopy}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
              copied
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            )}
          >
            {copied ? (
              <>
                <Check size={16} />
                Copied!
              </>
            ) : (
              <>
                <Copy size={16} />
                Copy
              </>
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 flex-1 min-h-0 overflow-y-auto">
        <pre className="text-sm text-gray-700 font-mono whitespace-pre-wrap leading-relaxed">
          {content}
        </pre>
      </div>
    </div>
  );
}
