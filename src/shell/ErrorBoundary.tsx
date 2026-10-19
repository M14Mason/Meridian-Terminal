import { Component, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

// One failing panel never takes down the app (21.4).
export class ErrorBoundary extends Component<{ children: ReactNode; label: string }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(`panel ${this.props.label} crashed:`, error.name);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="panel-error" role="alert">
        <div className="down">{this.props.label} failed to render.</div>
        <div className="muted">{this.state.error.message.slice(0, 200)}</div>
        <button onClick={() => this.setState({ error: null })}>RETRY</button>
      </div>
    );
  }
}
