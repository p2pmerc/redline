import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props { children: ReactNode; onRetry?: () => void }
interface State { error: Error | null }

/** A render crash shows a recoverable message instead of a blank page. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Redline UI error", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="mx-auto my-16 max-w-md space-y-4 rounded-2xl bg-surface-2 p-6 text-center shadow-surface-1">
        <h2 className="text-subtitle font-semibold">Something went wrong on this page</h2>
        <p className="text-body text-muted-foreground">Your reports and keys are safe. Try again, or reload the page.</p>
        <div className="flex justify-center gap-2">
          <button type="button" className="rounded-full bg-hover px-4 py-2 text-body font-medium" onClick={() => { this.setState({ error: null }); this.props.onRetry?.(); }}>Try again</button>
          <button type="button" className="rounded-full bg-hover px-4 py-2 text-body font-medium" onClick={() => location.reload()}>Reload</button>
        </div>
      </div>
    );
  }
}
