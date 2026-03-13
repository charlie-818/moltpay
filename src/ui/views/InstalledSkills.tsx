import React, { useState, useMemo } from 'react';
import { cn } from '../lib/utils';
import { InstalledSkill, SkillSource, TrustLevel } from '../../skills/types';
import { SkillCard } from '../components/SkillCard';
import {
  Search,
  Filter,
  Grid,
  List,
  FolderOpen,
  Globe,
  Server,
  SlidersHorizontal,
} from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

export interface InstalledSkillsProps {
  skills: InstalledSkill[];
  onUninstall: (skillId: string) => void;
  onEnable: (skillId: string) => void;
  onDisable: (skillId: string) => void;
  onConfigure: (skill: InstalledSkill) => void;
  onExecute: (skill: InstalledSkill) => void;
  className?: string;
}

type ViewMode = 'grid' | 'list';
type SortBy = 'name' | 'installed' | 'used' | 'source';

const sourceIcons: Record<SkillSource, typeof FolderOpen> = {
  local: FolderOpen,
  marketplace: Globe,
  mcp: Server,
};

export function InstalledSkills({
  skills,
  onUninstall,
  onEnable,
  onDisable,
  onConfigure,
  onExecute,
  className,
}: InstalledSkillsProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortBy, setSortBy] = useState<SortBy>('installed');
  const [sourceFilter, setSourceFilter] = useState<SkillSource | 'all'>('all');
  const [enabledFilter, setEnabledFilter] = useState<'all' | 'enabled' | 'disabled'>('all');

  // Filter and sort skills
  const filteredSkills = useMemo(() => {
    let result = [...skills];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        s =>
          s.metadata.name.toLowerCase().includes(query) ||
          s.metadata.description.toLowerCase().includes(query) ||
          s.metadata.tags.some(t => t.toLowerCase().includes(query))
      );
    }

    // Source filter
    if (sourceFilter !== 'all') {
      result = result.filter(s => s.source === sourceFilter);
    }

    // Enabled filter
    if (enabledFilter === 'enabled') {
      result = result.filter(s => s.enabled);
    } else if (enabledFilter === 'disabled') {
      result = result.filter(s => !s.enabled);
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.metadata.name.localeCompare(b.metadata.name);
        case 'installed':
          return b.installedAt - a.installedAt;
        case 'used':
          return (b.lastUsedAt || 0) - (a.lastUsedAt || 0);
        case 'source':
          return a.source.localeCompare(b.source);
        default:
          return 0;
      }
    });

    return result;
  }, [skills, searchQuery, sortBy, sourceFilter, enabledFilter]);

  // Source counts
  const sourceCounts = useMemo(() => {
    const counts: Record<SkillSource | 'all', number> = {
      all: skills.length,
      local: 0,
      marketplace: 0,
      mcp: 0,
    };
    for (const skill of skills) {
      counts[skill.source]++;
    }
    return counts;
  }, [skills]);

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Installed Skills</h2>
            <p className="text-sm text-gray-500">{skills.length} skills installed</p>
          </div>

          <div className="flex items-center gap-2">
            {/* View mode toggle */}
            <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setViewMode('grid')}
                className={cn(
                  'p-2 transition-colors',
                  viewMode === 'grid' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:bg-gray-50'
                )}
              >
                <Grid size={18} />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={cn(
                  'p-2 transition-colors',
                  viewMode === 'list' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:bg-gray-50'
                )}
              >
                <List size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-4 flex items-center gap-3">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search skills..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Source filter */}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">
                <Filter size={16} />
                Source: {sourceFilter === 'all' ? 'All' : sourceFilter}
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content className="min-w-[160px] bg-white rounded-lg shadow-lg border border-gray-200 py-1">
                <DropdownMenu.Item
                  className={cn(
                    'flex items-center justify-between px-3 py-2 text-sm cursor-pointer',
                    sourceFilter === 'all' ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'
                  )}
                  onClick={() => setSourceFilter('all')}
                >
                  <span>All</span>
                  <span className="text-gray-400">{sourceCounts.all}</span>
                </DropdownMenu.Item>
                {(['local', 'marketplace', 'mcp'] as SkillSource[]).map((source) => {
                  const Icon = sourceIcons[source];
                  return (
                    <DropdownMenu.Item
                      key={source}
                      className={cn(
                        'flex items-center justify-between px-3 py-2 text-sm cursor-pointer',
                        sourceFilter === source ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'
                      )}
                      onClick={() => setSourceFilter(source)}
                    >
                      <span className="flex items-center gap-2">
                        <Icon size={14} />
                        {source.charAt(0).toUpperCase() + source.slice(1)}
                      </span>
                      <span className="text-gray-400">{sourceCounts[source]}</span>
                    </DropdownMenu.Item>
                  );
                })}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>

          {/* Status filter */}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">
                <SlidersHorizontal size={16} />
                Status: {enabledFilter === 'all' ? 'All' : enabledFilter}
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content className="min-w-[120px] bg-white rounded-lg shadow-lg border border-gray-200 py-1">
                {(['all', 'enabled', 'disabled'] as const).map((status) => (
                  <DropdownMenu.Item
                    key={status}
                    className={cn(
                      'px-3 py-2 text-sm cursor-pointer',
                      enabledFilter === status ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'
                    )}
                    onClick={() => setEnabledFilter(status)}
                  >
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>

          {/* Sort */}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">
                Sort: {sortBy}
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content className="min-w-[140px] bg-white rounded-lg shadow-lg border border-gray-200 py-1">
                {([
                  { value: 'installed', label: 'Recently installed' },
                  { value: 'used', label: 'Recently used' },
                  { value: 'name', label: 'Name' },
                  { value: 'source', label: 'Source' },
                ] as const).map((option) => (
                  <DropdownMenu.Item
                    key={option.value}
                    className={cn(
                      'px-3 py-2 text-sm cursor-pointer',
                      sortBy === option.value ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'
                    )}
                    onClick={() => setSortBy(option.value)}
                  >
                    {option.label}
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>

      {/* Skills Grid/List */}
      <div className="flex-1 overflow-y-auto p-6">
        {filteredSkills.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <FolderOpen size={48} className="text-gray-300 mb-4" />
            <p className="text-lg font-medium">No skills found</p>
            <p className="text-sm mt-1">
              {searchQuery
                ? 'Try a different search term'
                : 'Install skills from the marketplace or add local SKILL.md files'}
            </p>
          </div>
        ) : (
          <div
            className={cn(
              viewMode === 'grid'
                ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
                : 'space-y-3'
            )}
          >
            {filteredSkills.map((skill) => (
              <SkillCard
                key={skill.id}
                skill={skill}
                variant={viewMode === 'list' ? 'compact' : 'installed'}
                onUninstall={() => onUninstall(skill.id)}
                onEnable={() => onEnable(skill.id)}
                onDisable={() => onDisable(skill.id)}
                onConfigure={() => onConfigure(skill)}
                onExecute={() => onExecute(skill)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
