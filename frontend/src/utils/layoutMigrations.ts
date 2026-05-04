/**
 * Dashboard layout versioning module (spec J).
 *
 * Applies forward-only migrations to dashboard JSON payloads
 * so that older saved dashboards always render correctly with
 * the current frontend.
 */

export const LATEST_VERSION = 2;

interface MigrationFn {
  (dashboard: Record<string, unknown>): Record<string, unknown>;
}

/**
 * Ordered list of migration functions.
 * Index 0 = v1 -> v2, index 1 = v2 -> v3, etc.
 */
const migrations: MigrationFn[] = [
  // v1 -> v2: Ensure all panels have display_options with defaults
  (d) => {
    const panels = (d.panels as Record<string, unknown>[] | undefined) ?? [];
    return {
      ...d,
      layout_version: 2,
      panels: panels.map((p) => ({
        ...p,
        display_options: (p.display_options as Record<string, unknown> | undefined) ?? {},
      })),
    };
  },
];

/**
 * Run all pending migrations on a dashboard payload.
 * Returns a new object (never mutates the input).
 */
export function migrateToLatest(
  dashboard: Record<string, unknown>,
): Record<string, unknown> {
  let current = { ...dashboard };
  const version = (current.layout_version as number) || 1;
  for (let i = version - 1; i < migrations.length; i++) {
    current = migrations[i](current);
  }
  return current;
}

/**
 * Returns true when the dashboard needs migration (i.e. its version
 * is behind LATEST_VERSION).
 */
export function needsMigration(dashboard: { layout_version?: number }): boolean {
  return (dashboard.layout_version ?? 1) < LATEST_VERSION;
}
