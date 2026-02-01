/**
 * Navigation system for the renderer process
 * Manages page routing and navigation state
 */

export type Page = 
  | "home"
  | "settings"
  | "inspector"
  | "onboarding";

export interface NavigationState {
  currentPage: Page;
  history: Page[];
}

class NavigationManager {
  private state: NavigationState = {
    currentPage: "home",
    history: [],
  };

  private listeners: Set<(page: Page) => void> = new Set();

  navigate(page: Page, replace = false): void {
    if (this.state.currentPage === page) {
      return; // Already on this page
    }

    if (!replace && this.state.currentPage !== page) {
      this.state.history.push(this.state.currentPage);
    }

    this.state.currentPage = page;
    this.notifyListeners();
  }

  back(): void {
    if (this.state.history.length > 0) {
      const previousPage = this.state.history.pop()!;
      this.state.currentPage = previousPage;
      this.notifyListeners();
    }
  }

  getCurrentPage(): Page {
    return this.state.currentPage;
  }

  canGoBack(): boolean {
    return this.state.history.length > 0;
  }

  subscribe(listener: (page: Page) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => {
      listener(this.state.currentPage);
    });
  }
}

export const navigation = new NavigationManager();
