/**
 * An error boundary with a "Reload panel" button (step 5.1d, UI_ARCHITECTURE §12). The panel shows what went wrong as text and
 * can be tried again without reloading the page. Plain and unstyled.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';

export interface ErrorBoundaryProps {
  /** Names the panel in the message ("The status panel stopped working"). */
  readonly label: string;
  /** Called with the error (the app logs it); the boundary itself never throws. */
  readonly onError?: (error: unknown, info: ErrorInfo) => void;
  readonly children: ReactNode;
}

interface ErrorBoundaryState {
  readonly failure: string | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { failure: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { failure: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  private readonly reload = (): void => this.setState({ failure: null });

  override render(): ReactNode {
    if (this.state.failure === null) return this.props.children;
    return (
      <section role="alert" aria-label={this.props.label}>
        <p>
          {this.props.label} stopped working: {this.state.failure}
        </p>
        <button type="button" onClick={this.reload}>
          Reload panel
        </button>
      </section>
    );
  }
}
