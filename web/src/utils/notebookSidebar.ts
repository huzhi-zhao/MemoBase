const STORAGE_KEY = "memos-notebook-sidebar-collapsed";

const listeners = new Set<() => void>();

const getStoredCollapsed = (): boolean => {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};

let currentCollapsed: boolean = getStoredCollapsed();

export const getNotebookSidebarCollapsed = (): boolean => currentCollapsed;

export const setNotebookSidebarCollapsed = (collapsed: boolean): void => {
  currentCollapsed = collapsed;
  try {
    localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
  } catch {
    // localStorage might not be available (SSR, private browsing, etc.)
  }
  listeners.forEach((listener) => listener());
};

export const toggleNotebookSidebarCollapsed = (): void => {
  setNotebookSidebarCollapsed(!currentCollapsed);
};

export const subscribeNotebookSidebarCollapsed = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
