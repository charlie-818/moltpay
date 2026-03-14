import React, { Component, ErrorInfo, ReactNode } from 'react';
import { cn } from '../lib/utils';
import { AlertTriangle, RefreshCw, Bug, Home, ChevronDown, ChevronUp } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    this.props.onError?.(error, errorInfo);

    // Log error to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('ErrorBoundary caught an error:', error, errorInfo);
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    });
    this.props.onReset?.();
  };

  toggleDetails = () => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <ErrorFallback
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          showDetails={this.state.showDetails}
          onToggleDetails={this.toggleDetails}
          onReset={this.handleReset}
        />
      );
    }

    return this.props.children;
  }
}

interface ErrorFallbackProps {
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
  onToggleDetails: () => void;
  onReset: () => void;
}

function ErrorFallback({
  error,
  errorInfo,
  showDetails,
  onToggleDetails,
  onReset,
}: ErrorFallbackProps) {
  return (
    <div className="min-h-[400px] flex items-center justify-center p-6">
      <div className="max-w-md w-full">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
            <AlertTriangle size={32} className="text-red-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Something went wrong
          </h2>
          <p className="text-gray-600">
            An unexpected error occurred. You can try again or return to the home page.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-6">
          <button
            onClick={onReset}
            className={cn(
              'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg',
              'bg-red-600 text-white font-medium',
              'hover:bg-red-700 transition-colors'
            )}
          >
            <RefreshCw size={18} />
            Try Again
          </button>
          <button
            onClick={() => window.location.reload()}
            className={cn(
              'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg',
              'bg-gray-100 text-gray-700 font-medium',
              'hover:bg-gray-200 transition-colors'
            )}
          >
            <Home size={18} />
            Reload Page
          </button>
        </div>

        {error && (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={onToggleDetails}
              className={cn(
                'w-full flex items-center justify-between p-3',
                'bg-gray-50 text-gray-700 hover:bg-gray-100 transition-colors'
              )}
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <Bug size={16} />
                Error Details
              </span>
              {showDetails ? (
                <ChevronUp size={16} />
              ) : (
                <ChevronDown size={16} />
              )}
            </button>
            {showDetails && (
              <div className="p-3 bg-white border-t border-gray-200">
                <div className="mb-2">
                  <span className="text-xs font-medium text-gray-500 uppercase">
                    Error Message
                  </span>
                  <pre className="mt-1 text-sm text-red-600 font-mono whitespace-pre-wrap">
                    {error.message}
                  </pre>
                </div>
                {errorInfo?.componentStack && (
                  <div>
                    <span className="text-xs font-medium text-gray-500 uppercase">
                      Component Stack
                    </span>
                    <pre className="mt-1 text-xs text-gray-600 font-mono whitespace-pre-wrap overflow-x-auto max-h-48 overflow-y-auto">
                      {errorInfo.componentStack}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Inline error display for non-critical errors
export interface InlineErrorProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  className?: string;
}

export function InlineError({
  title = 'Error',
  message,
  onRetry,
  onDismiss,
  className,
}: InlineErrorProps) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 p-4 rounded-lg',
        'bg-red-50 border border-red-200',
        className
      )}
      role="alert"
    >
      <AlertTriangle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-red-800">{title}</div>
        <div className="text-sm text-red-700 mt-1">{message}</div>
        {(onRetry || onDismiss) && (
          <div className="flex gap-3 mt-3">
            {onRetry && (
              <button
                onClick={onRetry}
                className="text-sm font-medium text-red-700 hover:text-red-800"
              >
                Try again
              </button>
            )}
            {onDismiss && (
              <button
                onClick={onDismiss}
                className="text-sm text-red-600 hover:text-red-700"
              >
                Dismiss
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Empty state component
export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn('text-center py-12', className)}>
      {icon && (
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 mb-4">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-medium text-gray-900 mb-2">{title}</h3>
      {description && (
        <p className="text-gray-500 max-w-sm mx-auto">{description}</p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className={cn(
            'mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg',
            'bg-red-600 text-white font-medium',
            'hover:bg-red-700 transition-colors'
          )}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

// Loading state component
export interface LoadingStateProps {
  message?: string;
  className?: string;
}

export function LoadingState({ message = 'Loading...', className }: LoadingStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-12', className)}>
      <div className="animate-spin rounded-full h-10 w-10 border-4 border-red-200 border-t-red-600 mb-4" />
      <p className="text-gray-500">{message}</p>
    </div>
  );
}
