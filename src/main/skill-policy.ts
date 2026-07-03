import type { SkillRecord } from "../shared/types.js";

export function canRouteSkill(skill: SkillRecord): boolean {
  return skill.status === "enabled" && skill.valid;
}

export function getEffectiveSkills(skills: SkillRecord[]): SkillRecord[] {
  return skills.filter(canRouteSkill);
}

export function canToggleSkill(skill: SkillRecord): boolean {
  return skill.valid && skill.status !== "quarantined" && skill.status !== "invalid";
}
