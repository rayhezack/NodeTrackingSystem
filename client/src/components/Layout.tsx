import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { BarChart3, ChevronDown, ClipboardList, History, LogOut, Search, ShieldCheck } from "lucide-react";
import { useCurrentUser } from "@client/src/hooks/use-current-user";
import { UserDisplay } from "@client/src/components/business-ui/user-display";
import { EyeTracker } from "@client/src/components/bencho/EyeTracker";
import { Button } from "@client/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@client/src/components/ui/dropdown-menu";

const navItems = [
  { path: "/", label: "埋点工作台", icon: BarChart3 },
  { path: "/query-library", label: "正式查询库", icon: Search },
  { path: "/permissions", label: "权限配置", icon: ShieldCheck },
];

const Layout = () => {
  const { pathname } = useLocation();
  const userInfo = useCurrentUser();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = () => {
    if (loggingOut) return;
    setLoggingOut(true);
    window.location.assign("/_pollocloud/logout");
  };

  const isActive = (path: string) => path === "/"
    ? pathname === "/" || pathname.startsWith("/tracking/")
    : pathname === path || pathname.startsWith(path + "/");

  return (
    <div className="tracking-app min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex min-h-16 max-w-[1400px] flex-wrap items-center gap-x-8 gap-y-2 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex shrink-0 items-center gap-2.5">
            <EyeTracker />
            <NavLink to="/" aria-label="Pollo 埋点工作台首页" className="text-lg font-semibold tracking-tight">pollo</NavLink>
          </div>
          <nav aria-label="主导航" className="order-last flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto">
            {navItems.map(({ path, label, icon: Icon }) => (
              <NavLink key={path} to={path} end={path === "/"} className={`inline-flex min-h-9 shrink-0 items-center gap-2 rounded-full px-3 text-sm transition-colors lg:px-4 ${isActive(path) ? "bg-primary-soft font-semibold text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                <Icon className="h-4 w-4" aria-hidden="true" />{label}
              </NavLink>
            ))}
          </nav>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="ml-auto gap-2" aria-label="打开用户与快捷导航菜单">
                {userInfo?.user_id ? <UserDisplay value={userInfo} size="small" showUserProfile={false} /> : <span>用户</span>}
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 rounded-lg p-1.5">
              <DropdownMenuLabel className="text-xs text-muted-foreground">快捷导航</DropdownMenuLabel>
              <DropdownMenuItem asChild><NavLink to="/#my-todos"><ClipboardList className="h-4 w-4" />我的待办</NavLink></DropdownMenuItem>
              <DropdownMenuItem asChild><NavLink to="/#recent-updates"><History className="h-4 w-4" />最近更新</NavLink></DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} disabled={loggingOut}><LogOut className="h-4 w-4" />{loggingOut ? "退出中..." : "退出登录"}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <main className="mx-auto min-w-0 max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-7">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
