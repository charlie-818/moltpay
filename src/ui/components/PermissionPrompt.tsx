import React, { useState } from 'react';
import { cn } from '../lib/utils';
import { PermissionRequest, PermissionScope, TrustLevel } from '../../skills/types';
import { TrustBadge } from './TrustBadge';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import {
  FileText,
  FilePen,
  Globe,
  Network,
  Wallet,
  Key,
  Send,
  Terminal,
  AlertTriangle,
  Clock,
  Shield,
  X,
} from 'lucide-react';

export interface PermissionPromptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skillName: string;
  skillId: string;
  trustLevel: TrustLevel;
  requests: PermissionRequest[];
  onApprove: (approvals: PermissionApproval[]) => void;
  onDeny: () => void;
}

export interface PermissionApproval {
  scope: PermissionScope;
  resource?: string;
  duration?: number;
}

const permissionConfig: Record<PermissionScope, {
  label: string;
  description: string;
  Icon: typeof FileText;
  riskLevel: 'low' | 'medium' | 'high';
}> = {
  file_read: {
    label: 'Read Files',
    description: 'Read files and directories',
    Icon: FileText,
    riskLevel: 'low',
  },
  file_write: {
    label: 'Write Files',
    description: 'Create, modify, and delete files',
    Icon: FilePen,
    riskLevel: 'medium',
  },
  network_fetch: {
    label: 'Fetch Data',
    description: 'Make HTTP requests to retrieve data',
    Icon: Globe,
    riskLevel: 'low',
  },
  network_connect: {
    label: 'Network Connect',
    description: 'Establish persistent network connections',
    Icon: Network,
    riskLevel: 'medium',
  },
  wallet_read: {
    label: 'View Wallet',
    description: 'View wallet balance and transaction history',
    Icon: Wallet,
    riskLevel: 'low',
  },
  wallet_sign: {
    label: 'Sign Transactions',
    description: 'Sign transactions with your wallet',
    Icon: Key,
    riskLevel: 'high',
  },
  wallet_send: {
    label: 'Send Funds',
    description: 'Send SOL or tokens from your wallet',
    Icon: Send,
    riskLevel: 'high',
  },
  system_exec: {
    label: 'Execute Commands',
    description: 'Run system commands and scripts',
    Icon: Terminal,
    riskLevel: 'high',
  },
};

const durationOptions = [
  { label: 'This session only', value: undefined },
  { label: '5 minutes', value: 5 * 60 * 1000 },
  { label: '1 hour', value: 60 * 60 * 1000 },
  { label: '24 hours', value: 24 * 60 * 60 * 1000 },
  { label: 'Always allow', value: -1 },
];

export function PermissionPrompt({
  open,
  onOpenChange,
  skillName,
  skillId,
  trustLevel,
  requests,
  onApprove,
  onDeny,
}: PermissionPromptProps) {
  const [approvals, setApprovals] = useState<Map<PermissionScope, PermissionApproval>>(
    new Map()
  );
  const [selectedDuration, setSelectedDuration] = useState<number | undefined>(undefined);

  const highRiskRequests = requests.filter(
    r => permissionConfig[r.scope].riskLevel === 'high'
  );

  const handleApprove = () => {
    const approvalList = requests.map(r => ({
      scope: r.scope,
      resource: r.resource,
      duration: selectedDuration === -1 ? undefined : selectedDuration,
    }));
    onApprove(approvalList);
    onOpenChange(false);
  };

  const handleDeny = () => {
    onDeny();
    onOpenChange(false);
  };

  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 bg-black/50" />
        <AlertDialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-white rounded-xl shadow-xl p-6">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <AlertDialog.Title className="text-lg font-semibold text-gray-900">
                Permission Request
              </AlertDialog.Title>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-sm text-gray-600">{skillName}</span>
                <TrustBadge trustLevel={trustLevel} size="sm" showLabel={false} />
              </div>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="p-1 rounded hover:bg-gray-100 text-gray-400"
            >
              <X size={20} />
            </button>
          </div>

          {/* Warning for high-risk permissions */}
          {highRiskRequests.length > 0 && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertTriangle className="text-yellow-600 flex-shrink-0 mt-0.5" size={18} />
                <div className="text-sm text-yellow-800">
                  <p className="font-medium">High-risk permissions requested</p>
                  <p className="mt-1 text-yellow-700">
                    This skill is requesting sensitive permissions. Only approve if you trust
                    this skill.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Permission List */}
          <div className="mt-4 space-y-3">
            {requests.map((request) => {
              const config = permissionConfig[request.scope];
              const Icon = config.Icon;

              return (
                <div
                  key={request.scope}
                  className={cn(
                    'p-3 rounded-lg border',
                    config.riskLevel === 'high'
                      ? 'border-red-200 bg-red-50'
                      : config.riskLevel === 'medium'
                      ? 'border-yellow-200 bg-yellow-50'
                      : 'border-gray-200 bg-gray-50'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        'p-2 rounded-lg',
                        config.riskLevel === 'high'
                          ? 'bg-red-100 text-red-600'
                          : config.riskLevel === 'medium'
                          ? 'bg-yellow-100 text-yellow-600'
                          : 'bg-gray-100 text-gray-600'
                      )}
                    >
                      <Icon size={18} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{config.label}</span>
                        <RiskBadge level={config.riskLevel} />
                      </div>
                      <p className="mt-0.5 text-sm text-gray-600">{config.description}</p>
                      {request.resource && (
                        <p className="mt-1 text-xs text-gray-500 font-mono bg-white px-2 py-1 rounded border border-gray-200">
                          {request.resource}
                        </p>
                      )}
                      {request.reason && (
                        <p className="mt-2 text-sm text-gray-600 italic">
                          "{request.reason}"
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Duration selector */}
          <div className="mt-4">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <Clock size={16} />
              Permission Duration
            </label>
            <select
              value={selectedDuration ?? 'session'}
              onChange={(e) =>
                setSelectedDuration(
                  e.target.value === 'session' ? undefined : Number(e.target.value)
                )
              }
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {durationOptions.map((opt) => (
                <option key={opt.label} value={opt.value ?? 'session'}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Actions */}
          <div className="mt-6 flex items-center gap-3">
            <AlertDialog.Cancel asChild>
              <button
                onClick={handleDeny}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Deny
              </button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button
                onClick={handleApprove}
                className={cn(
                  'flex-1 px-4 py-2 rounded-lg text-sm font-medium text-white',
                  highRiskRequests.length > 0
                    ? 'bg-yellow-600 hover:bg-yellow-700'
                    : 'bg-blue-600 hover:bg-blue-700'
                )}
              >
                <span className="flex items-center justify-center gap-2">
                  <Shield size={16} />
                  Approve
                </span>
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

function RiskBadge({ level }: { level: 'low' | 'medium' | 'high' }) {
  const config = {
    low: { label: 'Low Risk', className: 'bg-green-100 text-green-700' },
    medium: { label: 'Medium Risk', className: 'bg-yellow-100 text-yellow-700' },
    high: { label: 'High Risk', className: 'bg-red-100 text-red-700' },
  };

  return (
    <span className={cn('px-1.5 py-0.5 rounded text-xs font-medium', config[level].className)}>
      {config[level].label}
    </span>
  );
}
