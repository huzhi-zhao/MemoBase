const STORAGE_KEY = "memos-sidebar-mode";
const VALID_MODES = ["default", "mini"] as const;

export type SidebarMode = (typeof VALID_MODES)[number];

const listeners = new Set<() => void>();

const getStoredSidebarMode = (): SidebarMode => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return VALID_MODES.includes(stored as SidebarMode) ? (stored as SidebarMode) : "default";
  } catch {
    return "default";
  }
};

let currentMode: SidebarMode = getStoredSidebarMode();

export const getSidebarMode = (): SidebarMode => currentMode;

export const setSidebarMode = (mode: SidebarMode): void => {
  currentMode = mode;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // localStorage might not be available (SSR, private browsing, etc.)
  }
  listeners.forEach((listener) => listener());
};

export const subscribeSidebarMode = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
