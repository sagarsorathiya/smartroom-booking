import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

// @ts-ignore - Class component for error boundary
export class ErrorBoundary extends React.Component {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    (this as any).state = { hasError: false } as ErrorBoundaryState;
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    const state = (this as any).state as ErrorBoundaryState;
    const props = (this as any).props as ErrorBoundaryProps;

    if (state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-[60vh] bg-slate-50">
          <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 max-w-md text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">⚠️</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Something went wrong</h2>
            <p className="text-slate-500 text-sm mb-4">{state.error?.message}</p>
            <button
              onClick={() => (this as any).setState({ hasError: false, error: undefined })}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }
    return props.children;
  }
}
