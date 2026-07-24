import { NavLink, Outlet, useLocation } from "react-router-dom";
import { BarChart3, Search, ShieldCheck } from "lucide-react";
import { useCurrentUserProfile } from "@lark-apaas/client-toolkit/hooks/useCurrentUserProfile";
import { useAppInfo } from "@lark-apaas/client-toolkit/hooks/useAppInfo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@client/src/components/ui/dropdown-menu";
import { logger } from "@lark-apaas/client-toolkit/logger";
import { getDataloom } from "@lark-apaas/client-toolkit/dataloom";
import { useState } from "react";

const navItems = [
  { path: "/", label: "埋点工作台", icon: BarChart3 },
  { path: "/query-library", label: "正式查询库", icon: Search },
  { path: "/permissions", label: "权限配置", icon: ShieldCheck },
];

const Layout = () => {
  const { pathname } = useLocation();
  const userInfo = useCurrentUserProfile();
  const { appName } = useAppInfo();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      const dataloom = await getDataloom();
      const result = await dataloom.service.session.signOut();
      if (result.error) {
        logger.error("退出登录失败:", result.error.message);
        return;
      }
      window.location.reload();
    } catch (error) {
      logger.error("退出登录异常:", error);
    } finally {
      setLoggingOut(false);
    }
  };

  const isActive = (path: string) => {
    if (path === "/") return pathname === "/" || pathname.startsWith("/tracking/");
    return pathname === path || pathname.startsWith(path + "/");
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* 顶部导航栏 */}
      <header className="sticky top-0 z-50 border-b border-border bg-card">
        <div className="mx-auto flex h-12 max-w-[1400px] items-center justify-between px-2 sm:px-4">
          {/* 左侧：应用名 + 导航 */}
          <div className="flex min-w-0 items-center gap-2 sm:gap-4 lg:gap-6">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-sm bg-primary text-primary-foreground text-xs font-bold">
                P
              </div>
              <span className="hidden max-w-[180px] truncate text-sm font-semibold text-foreground md:inline">
                {appName || "Pollo AI 埋点项目管理"}
              </span>
            </div>
            <nav className="flex items-center gap-1">
              {navItems.map((item) => {
                const active = isActive(item.path);
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    aria-label={item.label}
                    title={item.label}
                    className={`flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-sm transition-colors sm:px-3 ${
                      active
                        ? "text-primary bg-primary/10"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="hidden sm:inline">{item.label}</span>
                  </NavLink>
                );
              })}
            </nav>
          </div>

          {/* 右侧：用户信息 */}
          <div className="flex shrink-0 items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-sm px-2 py-1 hover:bg-accent transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <div className="h-6 w-6 rounded-sm bg-primary/10 flex items-center justify-center text-primary text-xs font-medium">
                    {userInfo?.name?.charAt(0) || "U"}
                  </div>
                  <span className="text-sm text-foreground hidden sm:inline">
                    {userInfo?.name || "用户"}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  当前用户
                </DropdownMenuLabel>
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium text-foreground truncate">
                    {userInfo?.name || "未登录"}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {userInfo?.email || ""}
                  </p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className="text-sm cursor-pointer"
                >
                  {loggingOut ? "退出中..." : "退出登录"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* 主内容区 */}
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-[1400px] px-4 py-4">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Layout;
