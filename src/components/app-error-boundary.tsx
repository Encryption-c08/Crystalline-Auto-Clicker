import { Component, type ErrorInfo, type ReactNode } from "react";

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  error: Error | null;
};

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("React render failed", error, errorInfo);
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div className="flex h-screen items-center justify-center bg-background px-6 text-foreground">
        <div className="w-full max-w-xl rounded-lg border border-border bg-card/90 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Startup Error
          </p>
          <h1 className="mt-2 text-lg font-semibold">
            The desktop UI hit a frontend error while loading.
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This usually means the embedded webview rejected a browser API or a
            render-time dependency.
          </p>
          <pre className="mt-4 overflow-auto rounded-md border border-border/80 bg-background/80 p-3 text-xs whitespace-pre-wrap">
            {this.state.error.message}
          </pre>
        </div>
      </div>
    );
  }
}
