import { useSyncExternalStore } from "react";
import { getNotebookSidebarCollapsed, subscribeNotebookSidebarCollapsed } from "@/utils/notebookSidebar";

const useNotebookSidebarCollapsed = (): boolean => {
  return useSyncExternalStore(subscribeNotebookSidebarCollapsed, getNotebookSidebarCollapsed, getNotebookSidebarCollapsed);
};

export default useNotebookSidebarCollapsed;
