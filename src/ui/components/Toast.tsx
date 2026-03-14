import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { cn } from '../lib/utils';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Info,
  X,
  Loader2,
} from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info' | 'loading';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => string;
  removeToast: (id: string) => void;
  updateToast: (id: string, updates: Partial<Omit<Toast, 'id'>>) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

// Convenience methods
export function useToastActions() {
  const { addToast, removeToast, updateToast } = useToast();

  return {
    success: (title: string, message?: string) =>
      addToast({ type: 'success', title, message }),
    error: (title: string, message?: string) =>
      addToast({ type: 'error', title, message, duration: 6000 }),
    warning: (title: string, message?: string) =>
      addToast({ type: 'warning', title, message }),
    info: (title: string, message?: string) =>
      addToast({ type: 'info', title, message }),
    loading: (title: string, message?: string) =>
      addToast({ type: 'loading', title, message, duration: 0 }),
    dismiss: removeToast,
    update: updateToast,
  };
}

let toastId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toast: Omit<Toast, 'id'>): string => {
    const id = `toast-${++toastId}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
    return id;
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const updateToast = useCallback((id: string, updates: Partial<Omit<Toast, 'id'>>) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updates } : t))
    );
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, updateToast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </ToastContext.Provider>
  );
}

interface ToastContainerProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

interface ToastItemProps {
  toast: Toast;
  onDismiss: (id: string) => void;
}

const toastConfig: Record<ToastType, {
  icon: typeof CheckCircle;
  iconColor: string;
  bgColor: string;
  borderColor: string;
}> = {
  success: {
    icon: CheckCircle,
    iconColor: 'text-green-500',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
  },
  error: {
    icon: XCircle,
    iconColor: 'text-red-500',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
  },
  warning: {
    icon: AlertTriangle,
    iconColor: 'text-yellow-500',
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-200',
  },
  info: {
    icon: Info,
    iconColor: 'text-blue-500',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
  },
  loading: {
    icon: Loader2,
    iconColor: 'text-red-500',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
  },
};

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const config = toastConfig[toast.type];
  const Icon = config.icon;
  const duration = toast.duration ?? 4000;

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => onDismiss(toast.id), duration);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [toast.id, duration, onDismiss]);

  return (
    <div
      className={cn(
        'pointer-events-auto flex items-start gap-3 p-4 rounded-lg border shadow-lg',
        'animate-in slide-in-from-right-full fade-in duration-300',
        config.bgColor,
        config.borderColor
      )}
      role="alert"
    >
      <Icon
        size={20}
        className={cn(
          config.iconColor,
          toast.type === 'loading' && 'animate-spin'
        )}
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900">{toast.title}</div>
        {toast.message && (
          <div className="mt-1 text-sm text-gray-600">{toast.message}</div>
        )}
        {toast.action && (
          <button
            onClick={toast.action.onClick}
            className="mt-2 text-sm font-medium text-red-600 hover:text-red-700"
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        className="text-gray-400 hover:text-gray-600 transition-colors"
      >
        <X size={16} />
      </button>
    </div>
  );
}

// Standalone toast display for simple use cases without context
export interface StandaloneToastProps {
  type: ToastType;
  title: string;
  message?: string;
  onDismiss?: () => void;
  className?: string;
}

export function StandaloneToast({
  type,
  title,
  message,
  onDismiss,
  className,
}: StandaloneToastProps) {
  const config = toastConfig[type];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-4 rounded-lg border',
        config.bgColor,
        config.borderColor,
        className
      )}
      role="alert"
    >
      <Icon
        size={20}
        className={cn(
          config.iconColor,
          type === 'loading' && 'animate-spin'
        )}
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900">{title}</div>
        {message && (
          <div className="mt-1 text-sm text-gray-600">{message}</div>
        )}
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
