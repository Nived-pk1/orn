/**
 * An error boundary (step 5.1d, UI_ARCHITECTURE §12; step 8.4g, G7). It answers at once with one plain sentence and a native "Reload" (the panel is tried
 * again without reloading the page): nothing else is in the entry. The full screen (the EmptyState look, "Back up now" in Studio, the detail folded under
 * "Details") is a lazy chunk shown once it has loaded; when the chunk cannot be loaded (a new deploy while the page is open, no network) the plain
 * answer stays.
 */
import { Component, type ComponentType, type ErrorInfo, type ReactNode } from 'react';

const CHUNK = /dynamically imported module|Importing a module script failed|Load failed|Loading chunk/i;

type Screen = ComponentType<{ readonly label: string; readonly failure: string; readonly onReload: () => void; readonly backUp?: (() => void) | undefined }>;

export interface ErrorBoundaryProps {
  /** Names the panel in the message ("The status panel"). */
  readonly label: string;
  /** Called with the error (the app logs it); the boundary itself never throws. */
  readonly onError?: (error: unknown, info: ErrorInfo) => void;
  /** Studio: a way to back up the data from the error screen. */
  readonly backUp?: () => void;
  readonly children: ReactNode;
}

interface ErrorBoundaryState {
  readonly failure: string | null;
  readonly Screen: Screen | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { failure: null, Screen: null };

  static getDerivedStateFromError(error: unknown): Partial<ErrorBoundaryState> {
    return { failure: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    this.props.onError?.(error, info);
    void import('./error-screen').then((module) => this.setState({ Screen: module.ErrorScreen }), () => undefined);
  }

  // code that could not be loaded stays failed (a lazy view remembers it): only a new page load can fetch it again
  private readonly reload = (): void => (CHUNK.test(this.state.failure ?? '') ? window.location.reload() : this.setState({ failure: null }));

  override render(): ReactNode {
    const { failure, Screen } = this.state;
    if (failure === null) return this.props.children;
    if (Screen !== null) return <Screen label={this.props.label} failure={failure} onReload={this.reload} backUp={this.props.backUp} />;
    return (
      <section role="alert" aria-label={this.props.label}>
        <p>Something went wrong on this screen. Your saved data is safe.</p>
        <button type="button" onClick={this.reload}>
          Reload
        </button>
      </section>
    );
  }
}
