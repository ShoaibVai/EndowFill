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
        <div className="flex items-center justify-center p-6 h-screen bg-slate-50">
          <div className="max-w-xl w-full bg-white shadow-md rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
            <p className="text-sm text-slate-600 mb-4">
              An unexpected error occurred. You can try to recover the app or reload the page.
            </p>
            {this.state.error && (
              <details className="mb-4 text-xs text-rose-700 whitespace-pre-wrap">
                {this.state.error.toString()}
              </details>
            )}
            <div className="flex gap-2">
              <button
                onClick={this.reset}
                className="px-4 py-2 bg-slate-700 text-white rounded hover:bg-slate-800"
                aria-label="Try to recover application"
              >
                Try to recover
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 border border-slate-300 rounded hover:bg-slate-50"
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
