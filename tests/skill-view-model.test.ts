import { describe, expect, it } from "vitest";
import { buildSkillListViewModel } from "../src/renderer/src/skill-view-model.js";
import type { SkillRecord, SkillSource, SkillStatus } from "../src/shared/types.js";

describe("buildSkillListViewModel", () => {
  it("keeps global counts separate from the current filtered result counts", () => {
    const skills = [
      record({ id: "codex", name: "Codex skill", source: "codex-local", status: "enabled" }),
      record({ id: "imported", name: "Imported skill", source: "imported", status: "enabled" }),
      record({ id: "broken", name: "Broken skill", source: "plugin-cache", status: "invalid", valid: false })
    ];

    const view = buildSkillListViewModel({
      skills,
      search: "",
      sourceFilter: "imported",
      statusFilter: "all"
    });

    expect(view.globalCounts).toMatchObject({ total: 3, enabled: 2, invalid: 1 });
    expect(view.currentCounts).toMatchObject({ total: 1, enabled: 1, invalid: 0 });
    expect(view.statusFilterCounts).toMatchObject({ all: 1, effective: 1, disabled: 0, invalid: 0 });
    expect(view.visibleSkills.map((skill) => skill.id)).toEqual(["imported"]);
  });

  it("bases status filter counts on search and source filters before applying the active status filter", () => {
    const skills = [
      record({ id: "enabled-doc", name: "Doc helper", source: "codex-local", status: "enabled" }),
      record({ id: "disabled-doc", name: "Doc disabled", source: "codex-local", status: "disabled" }),
      record({ id: "other", name: "Browser helper", source: "codex-local", status: "enabled" }),
      record({ id: "imported-doc", name: "Doc imported", source: "imported", status: "enabled" })
    ];

    const view = buildSkillListViewModel({
      skills,
      search: "doc",
      sourceFilter: "codex-local",
      statusFilter: "enabled"
    });

    expect(view.statusFilterCounts).toMatchObject({ all: 2, effective: 1, enabled: 1, disabled: 1 });
    expect(view.currentCounts).toMatchObject({ total: 1, enabled: 1 });
    expect(view.visibleSkills.map((skill) => skill.id)).toEqual(["enabled-doc"]);
  });
});

function record(overrides: Partial<SkillRecord>): SkillRecord {
  return {
    id: "skill",
    name: "skill",
    description: "",
    summaryZh: "",
    path: "C:\\skill",
    source: "codex-local" as SkillSource,
    status: "enabled" as SkillStatus,
    readonly: true,
    canSetStatus: true,
    valid: true,
    issues: [],
    hash: "hash",
    lastScannedAt: "2026-07-08T00:00:00.000Z",
    ...overrides
  };
}
