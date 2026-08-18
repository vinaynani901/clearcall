import { Component } from 'react';

// Last-resort safety net: if any screen throws during render (a bad API
// response shape, a null-reference, anything unexpected), React would
// otherwise unmount the whole tree and leave a blank white page. This
// catches that and shows a friendly, recoverable screen instead — "never
// show a blank screen or unhandled error under any circumstances."
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Caught a render error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
          <div className="bold" style={{ fontSize: 17, marginBottom: 6 }}>Something went wrong</div>
          <p className="muted small" style={{ maxWidth: 340, margin: '0 0 20px' }}>
            We hit a snag loading this page. Your data is safe — try reloading.
          </p>
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
