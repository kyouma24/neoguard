import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Tabs } from "../design-system";
import { SystemMonitorDashboard } from "./dashboards/SystemMonitorDashboard";
import { DashboardList } from "./dashboards/DashboardList";

type Tab = "system" | "dashboards";

export function DashboardsPage() {
  const { user } = useAuth();
  const isAdmin = user?.is_super_admin || false;
  const [searchParams, setSearchParams] = useSearchParams();
  const defaultTab = isAdmin ? "system" : "dashboards";
  const tab = (searchParams.get("tab") as Tab) || defaultTab;
  const setTab = useCallback((t: Tab) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (t === defaultTab) next.delete("tab"); else next.set("tab", t);
      return next;
    }, { replace: true });
  }, [setSearchParams, defaultTab]);

  const tabItems = isAdmin
    ? [
        {
          id: "system" as const,
          label: "System Monitor",
          content: <SystemMonitorDashboard />,
        },
        {
          id: "dashboards" as const,
          label: "My Dashboards",
          content: <DashboardList />,
        },
      ]
    : [
        {
          id: "dashboards" as const,
          label: "My Dashboards",
          content: <DashboardList />,
        },
      ];

  return (
    <div>
      <Tabs
        tabs={tabItems}
        activeTab={tab}
        onChange={(tabId) => setTab(tabId as Tab)}
        variant="line"
      />
    </div>
  );
}
