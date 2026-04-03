"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class PortalErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("[portal] Unhandled error:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
          <div className="text-center space-y-4 max-w-sm">
            <h2 className="text-lg font-semibold text-gray-900">
              Algo deu errado
            </h2>
            <p className="text-sm text-gray-500">
              Ocorreu um erro inesperado. Tente recarregar a página.
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false });
                window.location.reload();
              }}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
            >
              Recarregar
            </button>
            <p className="text-[10px] text-gray-300">
              Em caso de crise, ligue 188 (CVV) ou 192 (SAMU).
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
