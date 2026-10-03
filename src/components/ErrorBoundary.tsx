import { Component, type ReactNode } from "react";
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <div role="alert" className="p-8 space-y-4">
      <p>This page could not be opened. Your pending changes remain on this device.</p>
      <button className="underline" onClick={() => window.location.reload()}>Reload</button>
    </div>;
    return this.props.children;
  }
}
