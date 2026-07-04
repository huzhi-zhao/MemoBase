import { BellIcon, CalendarDaysIcon, InfoIcon, LibraryBigIcon, PaperclipIcon, UserCircleIcon } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import useCurrentUser from "@/hooks/useCurrentUser";
import useNotebookSidebarCollapsed from "@/hooks/useNotebookSidebarCollapsed";
import useSidebarMode from "@/hooks/useSidebarMode";
import { useNotifications } from "@/hooks/useUserQueries";
import { cn } from "@/lib/utils";
import { Routes } from "@/router";
import { UserNotification_Status } from "@/types/proto/api/v1/user_service_pb";
import { useTranslate } from "@/utils/i18n";
import { toggleNotebookSidebarCollapsed } from "@/utils/notebookSidebar";
import MemosLogo from "./MemosLogo";
import UserMenu from "./UserMenu";

interface NavLinkItem {
  id: string;
  path: string;
  title: string;
  icon: React.ReactNode;
}

interface Props {
  collapsed?: boolean;
  className?: string;
}

const Navigation = (props: Props) => {
  const { collapsed, className } = props;
  const t = useTranslate();
  const currentUser = useCurrentUser();
  const { data: notifications = [] } = useNotifications();
  const location = useLocation();
  const isHome = location.pathname === Routes.HOME;
  const notebookSidebarCollapsed = useNotebookSidebarCollapsed();
  const sidebarMode = useSidebarMode();
  const isMini = sidebarMode === "mini";
  const iconSizeClass = isMini ? "w-4 h-auto shrink-0" : "w-6 h-auto shrink-0";

  const shelfNavLink: NavLinkItem = {
    id: "header-shelf",
    path: Routes.SHELF,
    title: t("bookshelf.title"),
    icon: <LibraryBigIcon className={iconSizeClass} />,
  };
  const exploreNavLink: NavLinkItem = {
    id: "header-explore",
    path: Routes.EXPLORE,
    title: t("common.explore"),
    icon: <CalendarDaysIcon className={iconSizeClass} />,
  };
  const aboutNavLink: NavLinkItem = {
    id: "header-about",
    path: Routes.ABOUT,
    title: t("common.about"),
    icon: <InfoIcon className={iconSizeClass} />,
  };
  const attachmentsNavLink: NavLinkItem = {
    id: "header-attachments",
    path: Routes.ATTACHMENTS,
    title: t("common.attachments"),
    icon: <PaperclipIcon className={iconSizeClass} />,
  };
  const unreadCount = notifications.filter((n) => n.status === UserNotification_Status.UNREAD).length;
  const inboxNavLink: NavLinkItem = {
    id: "header-inbox",
    path: Routes.INBOX,
    title: t("common.inbox"),
    icon: (
      <div className="relative">
        <BellIcon className={iconSizeClass} />
        {unreadCount > 0 && (
          <span
            className={cn(
              "absolute -top-1 -right-1 flex items-center justify-center bg-primary text-primary-foreground font-semibold rounded-full border-2 border-background",
              isMini ? "min-w-[14px] h-[14px] px-0.5 text-[8px]" : "min-w-[18px] h-[18px] px-1 text-[10px]",
            )}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </div>
    ),
  };
  const signInNavLink: NavLinkItem = {
    id: "header-auth",
    path: Routes.AUTH,
    title: t("common.sign-in"),
    icon: <UserCircleIcon className={iconSizeClass} />,
  };

  const primaryNavLinks: NavLinkItem[] = currentUser
    ? [shelfNavLink, exploreNavLink, attachmentsNavLink, inboxNavLink]
    : [exploreNavLink, aboutNavLink, signInNavLink];
  const inboxAriaLabel = unreadCount > 0 ? `${t("common.inbox")}, ${unreadCount} unread` : t("common.inbox");

  return (
    <header className={cn("w-full h-full overflow-auto flex flex-col justify-between items-start gap-4", className)}>
      <div className="w-full px-1 py-1 flex flex-col justify-start items-start space-y-2 overflow-auto overflow-x-hidden shrink">
        {isHome ? (
          <button
            type="button"
            className="mb-3 cursor-pointer"
            onClick={toggleNotebookSidebarCollapsed}
            title={t(notebookSidebarCollapsed ? "notebook.expand-sidebar" : "notebook.collapse-sidebar")}
          >
            <MemosLogo collapsed={collapsed} mini={isMini} />
          </button>
        ) : (
          <NavLink className="mb-3 cursor-default" to={currentUser ? Routes.HOME : Routes.EXPLORE}>
            <MemosLogo collapsed={collapsed} mini={isMini} />
          </NavLink>
        )}
        <TooltipProvider>
          {primaryNavLinks.map((navLink) => (
            <NavLink
              className={({ isActive }) =>
                cn(
                  "rounded-2xl border flex flex-row items-center text-sidebar-foreground transition-colors",
                  isMini ? "px-1.5 py-1.5 text-xs" : "px-2 py-2 text-lg",
                  collapsed ? "" : cn("w-full", isMini ? "px-2" : "px-4"),
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground border-sidebar-accent-border drop-shadow"
                    : "border-transparent hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:border-sidebar-accent-border opacity-80",
                )
              }
              key={navLink.id}
              to={navLink.path}
              end={navLink.path === Routes.HOME}
              id={navLink.id}
              aria-label={navLink.id === "header-inbox" ? inboxAriaLabel : undefined}
              viewTransition
            >
              {props.collapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>{navLink.icon}</div>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p>{navLink.title}</p>
                  </TooltipContent>
                </Tooltip>
              ) : (
                navLink.icon
              )}
              {!props.collapsed && <span className={cn("truncate", isMini ? "ml-2" : "ml-3")}>{navLink.title}</span>}
            </NavLink>
          ))}
        </TooltipProvider>
      </div>
      {currentUser && (
        <div className={cn("w-full flex flex-col justify-end", props.collapsed ? "items-center" : "items-start pl-3")}>
          <UserMenu collapsed={collapsed} mini={isMini} />
        </div>
      )}
    </header>
  );
};

export default Navigation;
