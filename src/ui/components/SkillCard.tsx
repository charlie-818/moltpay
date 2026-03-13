import React from 'react';
import { cn, formatDate, formatCurrency, formatRelativeTime } from '../lib/utils';
import { InstalledSkill, MarketplaceSkill, SkillMetadata } from '../../skills/types';
import { TrustBadge, PublisherBadge } from './TrustBadge';
import {
  Download,
  Star,
  Clock,
  Tag,
  MoreVertical,
  Play,
  Settings,
  Trash2,
  Power,
  PowerOff,
} from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

export interface SkillCardProps {
  skill: InstalledSkill | MarketplaceSkill;
  variant?: 'installed' | 'marketplace' | 'compact';
  onInstall?: () => void;
  onUninstall?: () => void;
  onEnable?: () => void;
  onDisable?: () => void;
  onConfigure?: () => void;
  onExecute?: () => void;
  isInstalling?: boolean;
  className?: string;
}

export function SkillCard({
  skill,
  variant = 'installed',
  onInstall,
  onUninstall,
  onEnable,
  onDisable,
  onConfigure,
  onExecute,
  isInstalling,
  className,
}: SkillCardProps) {
  const metadata = skill.metadata;
  const isInstalled = 'installedAt' in skill;
  const installedSkill = isInstalled ? (skill as InstalledSkill) : null;

  return (
    <div
      className={cn(
        'rounded-lg border border-gray-200 bg-white p-4 hover:border-gray-300 transition-colors',
        variant === 'compact' ? 'p-3' : 'p-4',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-900 truncate">{metadata.name}</h3>
            <TrustBadge
              trustLevel={metadata.trustLevel}
              certifications={metadata.certifications}
              size="sm"
              showLabel={false}
            />
          </div>
          <p className="mt-1 text-sm text-gray-600 line-clamp-2">
            {metadata.description}
          </p>
        </div>

        {/* Actions Menu */}
        {isInstalled && (
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                className="p-1 rounded hover:bg-gray-100 text-gray-500"
                aria-label="More actions"
              >
                <MoreVertical size={18} />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="min-w-[160px] bg-white rounded-lg shadow-lg border border-gray-200 py-1"
                sideOffset={5}
              >
                {onExecute && (
                  <DropdownMenu.Item
                    className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 cursor-pointer"
                    onClick={onExecute}
                  >
                    <Play size={16} />
                    Execute
                  </DropdownMenu.Item>
                )}
                {onConfigure && (
                  <DropdownMenu.Item
                    className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 cursor-pointer"
                    onClick={onConfigure}
                  >
                    <Settings size={16} />
                    Configure
                  </DropdownMenu.Item>
                )}
                {installedSkill?.enabled && onDisable && (
                  <DropdownMenu.Item
                    className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 cursor-pointer"
                    onClick={onDisable}
                  >
                    <PowerOff size={16} />
                    Disable
                  </DropdownMenu.Item>
                )}
                {!installedSkill?.enabled && onEnable && (
                  <DropdownMenu.Item
                    className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 cursor-pointer"
                    onClick={onEnable}
                  >
                    <Power size={16} />
                    Enable
                  </DropdownMenu.Item>
                )}
                <DropdownMenu.Separator className="h-px bg-gray-200 my-1" />
                {onUninstall && (
                  <DropdownMenu.Item
                    className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 cursor-pointer"
                    onClick={onUninstall}
                  >
                    <Trash2 size={16} />
                    Uninstall
                  </DropdownMenu.Item>
                )}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        )}
      </div>

      {/* Metadata Row */}
      <div className="mt-3 flex items-center gap-3 flex-wrap text-sm text-gray-500">
        {metadata.publisherName && (
          <PublisherBadge
            publisherName={metadata.publisherName}
            isPartner={metadata.trustLevel === 'verified'}
          />
        )}
        {metadata.rating !== undefined && (
          <span className="flex items-center gap-1">
            <Star size={14} className="text-yellow-400 fill-current" />
            <span>{metadata.rating.toFixed(1)}</span>
            {metadata.reviewCount !== undefined && (
              <span className="text-gray-400">({metadata.reviewCount})</span>
            )}
          </span>
        )}
        {metadata.installCount !== undefined && (
          <span className="flex items-center gap-1">
            <Download size={14} />
            <span>{formatInstallCount(metadata.installCount)}</span>
          </span>
        )}
        {metadata.lastUpdated && (
          <span className="flex items-center gap-1">
            <Clock size={14} />
            <span>{formatRelativeTime(metadata.lastUpdated)}</span>
          </span>
        )}
      </div>

      {/* Tags */}
      {metadata.tags.length > 0 && variant !== 'compact' && (
        <div className="mt-3 flex items-center gap-1 flex-wrap">
          {metadata.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600"
            >
              <Tag size={10} />
              {tag}
            </span>
          ))}
          {metadata.tags.length > 4 && (
            <span className="text-xs text-gray-400">+{metadata.tags.length - 4}</span>
          )}
        </div>
      )}

      {/* Pricing & Install Button */}
      {variant === 'marketplace' && (
        <div className="mt-4 flex items-center justify-between">
          <PricingBadge pricing={metadata.pricing} />
          <button
            onClick={onInstall}
            disabled={isInstalling}
            className={cn(
              'px-4 py-2 rounded-lg font-medium text-sm transition-colors',
              isInstalling
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            )}
          >
            {isInstalling ? 'Installing...' : 'Install'}
          </button>
        </div>
      )}

      {/* Status indicators for installed skills */}
      {isInstalled && installedSkill && variant !== 'compact' && (
        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-3 text-xs text-gray-500">
          <span
            className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full',
              installedSkill.enabled
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-600'
            )}
          >
            {installedSkill.enabled ? (
              <>
                <Power size={12} />
                Enabled
              </>
            ) : (
              <>
                <PowerOff size={12} />
                Disabled
              </>
            )}
          </span>
          <span>Source: {installedSkill.source}</span>
          {installedSkill.lastUsedAt && (
            <span>Last used: {formatRelativeTime(installedSkill.lastUsedAt)}</span>
          )}
        </div>
      )}
    </div>
  );
}

interface PricingBadgeProps {
  pricing?: SkillMetadata['pricing'];
}

function PricingBadge({ pricing }: PricingBadgeProps) {
  if (!pricing || pricing.model === 'free') {
    return (
      <span className="text-sm font-medium text-green-600">Free</span>
    );
  }

  return (
    <span className="text-sm font-medium text-gray-900">
      {formatCurrency(pricing.amount || 0, pricing.currency)}
      {pricing.model === 'subscription' && (
        <span className="text-gray-500 font-normal">/{pricing.interval}</span>
      )}
      {pricing.model === 'usage' && (
        <span className="text-gray-500 font-normal">/use</span>
      )}
    </span>
  );
}

function formatInstallCount(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
}
