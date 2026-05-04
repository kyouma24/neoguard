const STORAGE_KEY_PREFIX = "neoguard_recent_dashboards_";
const MAX_RECENT = 10;

/** Current tenant ID set by the auth layer. Must be called before reads/writes. */
let _currentTenantId: string | null = null;

export function setRecentDashboardsTenantId(tenantId: string | null): void {
  _currentTenantId = tenantId;
}

function storageKey(): string {
  // Without a tenant ID, use a safe fallback that won't leak across tenants
  const suffix = _currentTenantId ?? "_none";
  return `${STORAGE_KEY_PREFIX}${suffix}`;
}

export interface RecentDashboard {
  id: string;
  name: string;
  viewedAt: string;
}

function readRecent(): RecentDashboard[] {
  try {
    const raw = localStorage.getItem(storageKey());
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeRecent(items: RecentDashboard[]): void {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(items));
  } catch {
    // localStorage full or unavailable
  }
}

export function addRecentDashboard(id: string, name: string): void {
  const items = readRecent().filter((r) => r.id !== id);
  items.unshift({ id, name, viewedAt: new Date().toISOString() });
  writeRecent(items.slice(0, MAX_RECENT));
}

export function getRecentDashboards(): RecentDashboard[] {
  return readRecent();
}

export function removeRecentDashboard(id: string): void {
  writeRecent(readRecent().filter((r) => r.id !== id));
}
