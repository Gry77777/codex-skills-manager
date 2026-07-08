import { describe, expect, it } from "vitest";
import { canRouteSkill, getEffectiveSkills } from "../src/main/skill-policy.js";
import type { SkillRecord } from "../src/shared/types.js";

describe("SkillPolicy", () => {
  it("only routes enabled and valid skills", () => {
    const enabled = record({ id: "enabled", status: "enabled", valid: true });
    const disabled = record({ id: "disabled", status: "disabled", valid: true });
    const invalid = record({ id: "invalid", status: "invalid", valid: false });
    const quarantined = record({ id: "quarantined", status: "quarantined", valid: true });

    expect(canRouteSkill(enabled)).toBe(true);
    expect(getEffectiveSkills([enabled, disabled, invalid, quarantined])).toEqual([enabled]);
  });
});

function record(overrides: Partial<SkillRecord>): SkillRecord {
  return {
    id: "skill",
    name: "skill",
    description: "description",
    summaryZh: "用于测试。",
    path: "C:\\skill",
    source: "codex-local",
    status: "enabled",
    readonly: true,
    canSetStatus: true,
    valid: true,
    issues: [],
    hash: "hash",
    lastScannedAt: "2026-07-02T00:00:00.000Z",
    ...overrides
  };
}
