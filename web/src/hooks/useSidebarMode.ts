import { useSyncExternalStore } from "react";
import { getSidebarMode, type SidebarMode, subscribeSidebarMode } from "@/utils/sidebarMode";

const useSidebarMode = (): SidebarMode => {
  return useSyncExternalStore(subscribeSidebarMode, getSidebarMode, getSidebarMode);
};

export default useSidebarMode;
