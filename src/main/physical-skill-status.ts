import { promises as fs } from "node:fs";
import type { SettableSkillStatus, SkillRecord } from "../shared/types.js";
import { readSkillDiskState } from "./skill-disk-state.js";

export async function setPhysicalSkillStatus(skill: SkillRecord, status: SettableSkillStatus): Promise<void> {
  await setSkillDirectoryPhysicalStatus(skill.path, status);
}

export async function setSkillDirectoryPhysicalStatus(
  skillDirectory: string,
  status: SettableSkillStatus
): Promise<void> {
  const state = await readSkillDiskState(skillDirectory);

  if (state.kind === "conflict") {
    throw new Error("这个技能同时存在 SKILL.md 和 SKILL.md.disabled，请先使用一键修复处理冲突。");
  }

  if (status === "enabled") {
    if (state.kind === "enabled") {
      return;
    }

    if (state.kind !== "disabled") {
      throw new Error("找不到 SKILL.md.disabled，无法打开这个技能。");
    }

    await fs.rename(state.disabledPath, state.activePath);
    return;
  }

  if (state.kind === "disabled") {
    return;
  }

  if (state.kind !== "enabled") {
    throw new Error("找不到 SKILL.md，无法关闭这个技能。");
  }

  await fs.rename(state.activePath, state.disabledPath);
}
