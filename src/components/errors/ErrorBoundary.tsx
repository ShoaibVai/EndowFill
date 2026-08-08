import React from 'react';

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
  error?: Error | null;
};

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
    this.reset = this.reset.bind(this);
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Unhandled error caught by ErrorBoundary:', error, info);
    // TODO: send to telemetry / Sentry if configured
  }

  reset() {
    this.setState({ hasError: false, error: null });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center p-6 min-h-full bg-transparent">
          <div className="max-w-xl w-full bg-surface border border-subtle shadow-lg rounded-2xl p-8 text-center">
            <div className="empty-state__icon mx-auto">
              <svg
                className="w-7 h-7"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4" />
                <path d="M12 16h.01" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-ink mt-4">Something went wrong</h2>
            <p className="text-sm text-ink-muted mt-2 mb-4">
              An unexpected error occurred. You can try to recover the app or reload the page.
            </p>
            {this.state.error && (
              <details className="mb-4 text-xs text-error-600 dark:text-error-400 whitespace-pre-wrap text-left bg-inset rounded-lg p-3">
                {this.state.error.toString()}
              </details>
            )}
            <div className="flex gap-2 justify-center">
              <button
                onClick={this.reset}
                className="btn btn-primary btn-sm"
                aria-label="Try to recover application"
              >
                Try to recover
              </button>
              <button
                onClick={() => window.location.reload()}
                className="btn btn-ghost btn-sm"
                aria-label="Reload page"
              >
                Reload page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children as React.ReactElement;
  }
}

export default ErrorBoundary;
