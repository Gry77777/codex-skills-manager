import type { SkillRecord, SkillRepairSummary } from "../shared/types.js";
import { getRegistryPath } from "./paths.js";
import { SkillRepairExecutor } from "./skill-repair-executor.js";
import { SkillRepairPlanner } from "./skill-repair-planner.js";

export class SkillRepairer {
  private readonly planner = new SkillRepairPlanner();
  private readonly executor: SkillRepairExecutor;

  constructor(registryPath = getRegistryPath()) {
    this.executor = new SkillRepairExecutor(registryPath);
  }

  async repair(records: SkillRecord[]): Promise<SkillRepairSummary> {
    const plan = await this.planner.plan(records);
    return this.executor.execute(plan);
  }
}
