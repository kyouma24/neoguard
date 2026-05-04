import { describe, it, expect } from "vitest";
import { migrateToLatest, needsMigration, LATEST_VERSION } from "./layoutMigrations";

describe("layoutMigrations", () => {
  describe("needsMigration", () => {
    it("returns true when layout_version is missing", () => {
      expect(needsMigration({})).toBe(true);
    });

    it("returns true when layout_version is below latest", () => {
      expect(needsMigration({ layout_version: 1 })).toBe(true);
    });

    it("returns false when layout_version equals latest", () => {
      expect(needsMigration({ layout_version: LATEST_VERSION })).toBe(false);
    });

    it("returns false when layout_version exceeds latest", () => {
      expect(needsMigration({ layout_version: LATEST_VERSION + 1 })).toBe(false);
    });
  });

  describe("migrateToLatest", () => {
    it("migrates a v1 dashboard to v2 with display_options defaults", () => {
      const v1Dashboard: Record<string, unknown> = {
        id: "dash-1",
        name: "My Dashboard",
        panels: [
          { id: "p1", title: "CPU", panel_type: "timeseries", width: 6, height: 4 },
          { id: "p2", title: "Memory", panel_type: "area", width: 6, height: 4, display_options: { fillOpacity: 0.5 } },
        ],
      };

      const result = migrateToLatest(v1Dashboard);

      expect(result.layout_version).toBe(2);
      const panels = result.panels as Record<string, unknown>[];
      expect(panels).toHaveLength(2);
      // First panel gets empty display_options
      expect(panels[0].display_options).toEqual({});
      // Second panel retains its existing display_options
      expect(panels[1].display_options).toEqual({ fillOpacity: 0.5 });
    });

    it("leaves a v2 dashboard unchanged", () => {
      const v2Dashboard: Record<string, unknown> = {
        layout_version: 2,
        panels: [
          { id: "p1", title: "CPU", display_options: { unit: { category: "percent" } } },
        ],
      };

      const result = migrateToLatest(v2Dashboard);

      expect(result.layout_version).toBe(2);
      const panels = result.panels as Record<string, unknown>[];
      expect(panels[0].display_options).toEqual({ unit: { category: "percent" } });
    });

    it("defaults missing layout_version to v1", () => {
      const dashboard: Record<string, unknown> = {
        panels: [{ id: "p1", title: "Test" }],
      };

      const result = migrateToLatest(dashboard);

      // Should have been migrated from v1 -> v2
      expect(result.layout_version).toBe(2);
    });

    it("handles dashboard with no panels array", () => {
      const dashboard: Record<string, unknown> = {
        name: "Empty Dashboard",
      };

      const result = migrateToLatest(dashboard);

      expect(result.layout_version).toBe(2);
      expect(result.panels).toEqual([]);
    });

    it("does not mutate the original dashboard object", () => {
      const original: Record<string, unknown> = {
        panels: [{ id: "p1", title: "Original" }],
      };
      const originalCopy = JSON.parse(JSON.stringify(original));

      migrateToLatest(original);

      expect(original).toEqual(originalCopy);
    });

    it("applies migrations sequentially from current version", () => {
      // A v1 dashboard should go through all migrations v1->v2
      const dashboard: Record<string, unknown> = {
        layout_version: 1,
        panels: [
          { id: "p1", title: "No Options" },
        ],
      };

      const result = migrateToLatest(dashboard);

      expect(result.layout_version).toBe(LATEST_VERSION);
      // Verify the v1->v2 migration added display_options
      const panels = result.panels as Record<string, unknown>[];
      expect(panels[0].display_options).toEqual({});
    });

    it("preserves all other dashboard fields during migration", () => {
      const dashboard: Record<string, unknown> = {
        id: "dash-123",
        name: "Full Dashboard",
        description: "A test dashboard",
        variables: [{ name: "env", type: "custom" }],
        groups: [{ id: "g1", label: "Group 1" }],
        tags: ["production"],
        panels: [{ id: "p1", title: "Test" }],
      };

      const result = migrateToLatest(dashboard);

      expect(result.id).toBe("dash-123");
      expect(result.name).toBe("Full Dashboard");
      expect(result.description).toBe("A test dashboard");
      expect(result.variables).toEqual([{ name: "env", type: "custom" }]);
      expect(result.groups).toEqual([{ id: "g1", label: "Group 1" }]);
      expect(result.tags).toEqual(["production"]);
    });
  });
});
