import React, { useState, useEffect } from 'react';
import { cn, formatCurrency } from '../lib/utils';
import { MarketplaceSkill, TrustLevel, SkillPricing } from '../../skills/types';
import { SkillCard } from '../components/SkillCard';
import { TrustBadge } from '../components/TrustBadge';
import {
  Search,
  Filter,
  Sparkles,
  TrendingUp,
  Star,
  Clock,
  Tag,
  X,
  Loader2,
} from 'lucide-react';
import * as Tabs from '@radix-ui/react-tabs';

export interface SkillMarketplaceProps {
  skills: MarketplaceSkill[];
  isLoading?: boolean;
  installedSkillIds?: Set<string>;
  onSearch: (query: string) => void;
  onInstall: (skill: MarketplaceSkill) => Promise<void>;
  onLoadMore?: () => void;
  hasMore?: boolean;
  className?: string;
}

interface FilterState {
  trustLevels: Set<TrustLevel>;
  pricingModels: Set<SkillPricing['model']>;
  tags: Set<string>;
}

export function SkillMarketplace({
  skills,
  isLoading,
  installedSkillIds = new Set(),
  onSearch,
  onInstall,
  onLoadMore,
  hasMore,
  className,
}: SkillMarketplaceProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('discover');
  const [filters, setFilters] = useState<FilterState>({
    trustLevels: new Set(),
    pricingModels: new Set(),
    tags: new Set(),
  });
  const [installingIds, setInstallingIds] = useState<Set<string>>(new Set());

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      onSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, onSearch]);

  // Get popular tags from skills
  const popularTags = React.useMemo(() => {
    const tagCounts = new Map<string, number>();
    for (const skill of skills) {
      for (const tag of skill.metadata.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    }
    return Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag]) => tag);
  }, [skills]);

  // Filter skills
  const filteredSkills = React.useMemo(() => {
    return skills.filter((skill) => {
      // Trust level filter
      if (filters.trustLevels.size > 0 && !filters.trustLevels.has(skill.metadata.trustLevel)) {
        return false;
      }

      // Pricing model filter
      if (filters.pricingModels.size > 0) {
        const model = skill.metadata.pricing?.model || 'free';
        if (!filters.pricingModels.has(model)) {
          return false;
        }
      }

      // Tag filter
      if (filters.tags.size > 0) {
        const hasMatchingTag = skill.metadata.tags.some(t => filters.tags.has(t));
        if (!hasMatchingTag) {
          return false;
        }
      }

      return true;
    });
  }, [skills, filters]);

  const handleInstall = async (skill: MarketplaceSkill) => {
    setInstallingIds(prev => new Set(prev).add(skill.id));
    try {
      await onInstall(skill);
    } finally {
      setInstallingIds(prev => {
        const next = new Set(prev);
        next.delete(skill.id);
        return next;
      });
    }
  };

  const toggleFilter = <K extends keyof FilterState>(
    key: K,
    value: FilterState[K] extends Set<infer T> ? T : never
  ) => {
    setFilters(prev => {
      const newSet = new Set(prev[key]) as FilterState[K];
      if ((newSet as Set<unknown>).has(value)) {
        (newSet as Set<unknown>).delete(value);
      } else {
        (newSet as Set<unknown>).add(value);
      }
      return { ...prev, [key]: newSet };
    });
  };

  const clearFilters = () => {
    setFilters({
      trustLevels: new Set(),
      pricingModels: new Set(),
      tags: new Set(),
    });
  };

  const hasActiveFilters = filters.trustLevels.size > 0 || filters.pricingModels.size > 0 || filters.tags.size > 0;

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Skill Marketplace</h2>
            <p className="text-sm text-gray-500">
              Discover and install skills to extend your agent's capabilities
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="mt-4 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Search skills..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Tabs */}
        <Tabs.Root value={activeTab} onValueChange={setActiveTab} className="mt-4">
          <Tabs.List className="flex gap-1 border-b border-gray-200">
            <Tabs.Trigger
              value="discover"
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors',
                activeTab === 'discover'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              )}
            >
              <Sparkles size={16} />
              Discover
            </Tabs.Trigger>
            <Tabs.Trigger
              value="trending"
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors',
                activeTab === 'trending'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              )}
            >
              <TrendingUp size={16} />
              Trending
            </Tabs.Trigger>
            <Tabs.Trigger
              value="top-rated"
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors',
                activeTab === 'top-rated'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              )}
            >
              <Star size={16} />
              Top Rated
            </Tabs.Trigger>
            <Tabs.Trigger
              value="new"
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors',
                activeTab === 'new'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              )}
            >
              <Clock size={16} />
              New
            </Tabs.Trigger>
          </Tabs.List>
        </Tabs.Root>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar Filters */}
        <div className="w-64 flex-shrink-0 border-r border-gray-200 p-4 overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-gray-900 flex items-center gap-2">
              <Filter size={16} />
              Filters
            </h3>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-xs text-blue-600 hover:underline"
              >
                Clear all
              </button>
            )}
          </div>

          {/* Trust Level Filter */}
          <div className="mb-6">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Trust Level</h4>
            <div className="space-y-2">
              {(['verified', 'community', 'untrusted'] as TrustLevel[]).map((level) => (
                <label key={level} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.trustLevels.has(level)}
                    onChange={() => toggleFilter('trustLevels', level)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <TrustBadge trustLevel={level} size="sm" />
                </label>
              ))}
            </div>
          </div>

          {/* Pricing Filter */}
          <div className="mb-6">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Pricing</h4>
            <div className="space-y-2">
              {[
                { value: 'free', label: 'Free' },
                { value: 'one-time', label: 'One-time purchase' },
                { value: 'subscription', label: 'Subscription' },
                { value: 'usage', label: 'Pay per use' },
              ].map((option) => (
                <label key={option.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.pricingModels.has(option.value as SkillPricing['model'])}
                    onChange={() => toggleFilter('pricingModels', option.value as SkillPricing['model'])}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-600">{option.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Popular Tags */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">Popular Tags</h4>
            <div className="flex flex-wrap gap-1">
              {popularTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => toggleFilter('tags', tag)}
                  className={cn(
                    'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-colors',
                    filters.tags.has(tag)
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  )}
                >
                  <Tag size={10} />
                  {tag}
                  {filters.tags.has(tag) && <X size={10} />}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Skills Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading && skills.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="animate-spin text-gray-400" size={32} />
            </div>
          ) : filteredSkills.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <Search size={48} className="text-gray-300 mb-4" />
              <p className="text-lg font-medium">No skills found</p>
              <p className="text-sm mt-1">
                Try adjusting your search or filters
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredSkills.map((skill) => (
                  <SkillCard
                    key={skill.id}
                    skill={skill}
                    variant="marketplace"
                    onInstall={() => handleInstall(skill)}
                    isInstalling={installingIds.has(skill.id)}
                  />
                ))}
              </div>

              {/* Load More */}
              {hasMore && (
                <div className="mt-6 flex justify-center">
                  <button
                    onClick={onLoadMore}
                    disabled={isLoading}
                    className="px-6 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {isLoading ? (
                      <span className="flex items-center gap-2">
                        <Loader2 size={16} className="animate-spin" />
                        Loading...
                      </span>
                    ) : (
                      'Load More'
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
