import React, { useState } from 'react';
import { cn, formatCurrency } from '../lib/utils';
import { IntentPreview as IntentPreviewType, SkillExecutionStep } from '../../skills/types';
import * as Dialog from '@radix-ui/react-dialog';
import {
  CheckCircle,
  Circle,
  Loader2,
  AlertTriangle,
  XCircle,
  Wallet,
  FileEdit,
  Globe,
  ChevronDown,
  ChevronUp,
  X,
  Play,
  Pause,
  Edit,
} from 'lucide-react';

export interface IntentPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: IntentPreviewType;
  onCancel: () => void;
  onEdit?: () => void;
  onApprove: () => void;
  isExecuting?: boolean;
  currentStepIndex?: number;
}

const stepStatusConfig: Record<string, {
  Icon: typeof Circle;
  color: string;
  bgColor: string;
  animate?: boolean;
}> = {
  pending: {
    Icon: Circle,
    color: 'text-gray-400',
    bgColor: 'bg-gray-100',
  },
  running: {
    Icon: Loader2,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
    animate: true,
  },
  completed: {
    Icon: CheckCircle,
    color: 'text-green-600',
    bgColor: 'bg-green-100',
  },
  failed: {
    Icon: XCircle,
    color: 'text-red-600',
    bgColor: 'bg-red-100',
  },
  requires_approval: {
    Icon: AlertTriangle,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-100',
  },
};

const approvalTypeIcons = {
  wallet_sign: Wallet,
  file_write: FileEdit,
  network: Globe,
  other: AlertTriangle,
};

export function IntentPreview({
  open,
  onOpenChange,
  preview,
  onCancel,
  onEdit,
  onApprove,
  isExecuting = false,
  currentStepIndex,
}: IntentPreviewProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

  const toggleStep = (stepId: string) => {
    const newExpanded = new Set(expandedSteps);
    if (newExpanded.has(stepId)) {
      newExpanded.delete(stepId);
    } else {
      newExpanded.add(stepId);
    }
    setExpandedSteps(newExpanded);
  };

  const hasApprovalRequired = preview.steps.some(s => s.requiresApproval);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-white rounded-xl shadow-xl overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <Dialog.Title className="text-lg font-semibold text-gray-900">
                {preview.skillName}
              </Dialog.Title>
              <button
                onClick={() => onOpenChange(false)}
                className="p-1 rounded hover:bg-gray-100 text-gray-400"
              >
                <X size={20} />
              </button>
            </div>
            <p className="mt-1 text-sm text-gray-600">
              {preview.action}
            </p>
          </div>

          {/* Steps */}
          <div className="px-6 py-4 max-h-[400px] overflow-y-auto">
            <h4 className="text-sm font-medium text-gray-700 mb-3">Steps</h4>
            <div className="space-y-2">
              {preview.steps.map((step, index) => {
                const config = stepStatusConfig[step.status];
                const Icon = config.Icon;
                const isExpanded = expandedSteps.has(step.id);
                const isCurrent = currentStepIndex === index;
                const ApprovalIcon = step.approvalType
                  ? approvalTypeIcons[step.approvalType]
                  : null;

                return (
                  <div
                    key={step.id}
                    className={cn(
                      'rounded-lg border transition-colors',
                      isCurrent ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white',
                      step.status === 'failed' && 'border-red-200 bg-red-50'
                    )}
                  >
                    <div
                      className="flex items-start gap-3 p-3 cursor-pointer"
                      onClick={() => toggleStep(step.id)}
                    >
                      <div
                        className={cn(
                          'p-1 rounded-full',
                          config.bgColor
                        )}
                      >
                        <Icon
                          size={16}
                          className={cn(
                            config.color,
                            config.animate && 'animate-spin'
                          )}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900 truncate">
                            {index + 1}. {step.description}
                          </span>
                          {step.requiresApproval && ApprovalIcon && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-700">
                              <ApprovalIcon size={12} />
                              Approval
                            </span>
                          )}
                        </div>
                        {step.error && (
                          <p className="mt-1 text-xs text-red-600">
                            {step.error}
                          </p>
                        )}
                      </div>
                      <button className="text-gray-400">
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </div>

                    {isExpanded && step.result !== undefined && (
                      <div className="px-3 pb-3 pt-0">
                        <pre className="text-xs bg-gray-100 p-2 rounded overflow-x-auto">
                          {typeof step.result === 'string'
                            ? step.result
                            : JSON.stringify(step.result, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Warnings */}
          {preview.warnings && preview.warnings.length > 0 && (
            <div className="px-6 py-3 bg-yellow-50 border-t border-yellow-200">
              <div className="flex items-start gap-2">
                <AlertTriangle className="text-yellow-600 flex-shrink-0 mt-0.5" size={16} />
                <div className="text-sm text-yellow-800">
                  {preview.warnings.map((warning, i) => (
                    <p key={i}>{warning}</p>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Cost estimate */}
          {preview.estimatedCost && (
            <div className="px-6 py-3 bg-gray-50 border-t border-gray-200">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Estimated Cost</span>
                <span className="font-medium text-gray-900">
                  {formatCurrency(preview.estimatedCost.amount, preview.estimatedCost.currency)}
                </span>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
            <div className="flex items-center gap-3">
              <button
                onClick={onCancel}
                disabled={isExecuting}
                className={cn(
                  'flex-1 px-4 py-2 border rounded-lg text-sm font-medium transition-colors',
                  isExecuting
                    ? 'border-gray-200 text-gray-400 cursor-not-allowed'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-100'
                )}
              >
                Cancel
              </button>
              {onEdit && !isExecuting && (
                <button
                  onClick={onEdit}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100"
                >
                  <Edit size={16} />
                </button>
              )}
              <button
                onClick={onApprove}
                disabled={isExecuting}
                className={cn(
                  'flex-1 px-4 py-2 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-2 transition-colors',
                  isExecuting
                    ? 'bg-blue-400 cursor-not-allowed'
                    : hasApprovalRequired
                    ? 'bg-yellow-600 hover:bg-yellow-700'
                    : 'bg-blue-600 hover:bg-blue-700'
                )}
              >
                {isExecuting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Executing...
                  </>
                ) : (
                  <>
                    <Play size={16} />
                    Approve & Execute
                  </>
                )}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// Compact version for inline display
export interface IntentPreviewInlineProps {
  preview: IntentPreviewType;
  className?: string;
}

export function IntentPreviewInline({ preview, className }: IntentPreviewInlineProps) {
  return (
    <div className={cn('rounded-lg border border-gray-200 bg-white p-4', className)}>
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-medium text-gray-900">{preview.skillName}</h4>
          <p className="text-sm text-gray-600">{preview.action}</p>
        </div>
        {preview.estimatedCost && (
          <span className="text-sm font-medium text-gray-900">
            ~{formatCurrency(preview.estimatedCost.amount, preview.estimatedCost.currency)}
          </span>
        )}
      </div>

      <div className="mt-3 space-y-1">
        {preview.steps.slice(0, 3).map((step, index) => {
          const config = stepStatusConfig[step.status];
          const Icon = config.Icon;

          return (
            <div key={step.id} className="flex items-center gap-2 text-sm">
              <Icon size={14} className={config.color} />
              <span className="text-gray-600 truncate">
                {index + 1}. {step.description}
              </span>
              {step.requiresApproval && (
                <AlertTriangle size={12} className="text-yellow-500" />
              )}
            </div>
          );
        })}
        {preview.steps.length > 3 && (
          <span className="text-xs text-gray-400">
            +{preview.steps.length - 3} more steps
          </span>
        )}
      </div>
    </div>
  );
}
