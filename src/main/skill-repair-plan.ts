import path from "node:path";
import type { SkillRecord } from "../shared/types.js";

export type SkillRepairOperation =
  | {
      type: "remove-registry-record";
      id: string;
    }
  | {
      type: "rename-file";
      from: string;
      to: string;
    }
  | {
      type: "prepend-frontmatter";
      filePath: string;
      name: string;
      description: string;
    };

export type SkillRepairPlanItem = {
  record: SkillRecord;
  action: string;
  message: string;
  operations: SkillRepairOperation[];
  skip?: boolean;
};

export type SkillRepairPlan = {
  checked: number;
  items: SkillRepairPlanItem[];
};

export function buildFrontmatterPatch(record: SkillRecord): { name: string; description: string } {
  const name = sanitizeSkillName(record.name || path.basename(record.path));
  const description = sanitizeDescription(record.description || `Repaired skill: ${name}`);
  return { name, description };
}

function sanitizeSkillName(value: string): string {
  return value.replace(/[\r\n:]/g, "-").trim() || "repaired-skill";
}

function sanitizeDescription(value: string): string {
  return value.replace(/[\r\n]/g, " ").trim() || "Repaired skill.";
}
