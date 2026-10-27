import { Component } from 'react';
import { ErrorState } from '../ui/ErrorState';
import { Button } from '../ui/Button';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="loader-screen">
        <ErrorState
          title="This screen could not be loaded"
          description="Refresh the page and try again."
          action={(
            <Button variant="primary" onClick={() => window.location.reload()}>
              Refresh
            </Button>
          )}
        />
      </div>
    );
  }
}
