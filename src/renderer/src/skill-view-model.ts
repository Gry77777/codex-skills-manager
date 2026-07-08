import type { SkillRecord, SkillSource, SkillStatus } from "../../shared/types.js";

export type SourceFilter = "all" | SkillSource;
export type StatusFilter = "all" | SkillStatus | "effective";

export type SkillCounts = {
  total: number;
  enabled: number;
  disabled: number;
  imported: number;
  invalid: number;
};

export type StatusFilterCounts = SkillCounts & {
  all: number;
  effective: number;
};

export type SkillListViewModelInput = {
  skills: SkillRecord[];
  search: string;
  sourceFilter: SourceFilter;
  statusFilter: StatusFilter;
};

export type SkillListViewModel = {
  visibleSkills: SkillRecord[];
  globalCounts: SkillCounts;
  currentCounts: SkillCounts;
  statusFilterCounts: StatusFilterCounts;
};

export function buildSkillListViewModel(input: SkillListViewModelInput): SkillListViewModel {
  const query = input.search.trim().toLowerCase();
  const matchesSearchAndSource = input.skills.filter(
    (skill) => matchesSearch(skill, query) && matchesSource(skill, input.sourceFilter)
  );
  const visibleSkills = matchesSearchAndSource.filter((skill) => matchesStatus(skill, input.statusFilter));

  return {
    visibleSkills,
    globalCounts: countSkills(input.skills),
    currentCounts: countSkills(visibleSkills),
    statusFilterCounts: countStatusFilters(matchesSearchAndSource)
  };
}

export function canUseSkillStatusToggle(skill: SkillRecord): boolean {
  return skill.canSetStatus && skill.valid && skill.status !== "quarantined" && skill.status !== "invalid";
}

function matchesSearch(skill: SkillRecord, query: string): boolean {
  return (
    query.length === 0 ||
    skill.name.toLowerCase().includes(query) ||
    skill.description.toLowerCase().includes(query) ||
    skill.summaryZh.toLowerCase().includes(query) ||
    skill.path.toLowerCase().includes(query)
  );
}

function matchesSource(skill: SkillRecord, sourceFilter: SourceFilter): boolean {
  return sourceFilter === "all" || skill.source === sourceFilter;
}

function matchesStatus(skill: SkillRecord, statusFilter: StatusFilter): boolean {
  return (
    statusFilter === "all" ||
    skill.status === statusFilter ||
    (statusFilter === "effective" && skill.status === "enabled" && skill.valid)
  );
}

function countSkills(skills: SkillRecord[]): SkillCounts {
  return {
    total: skills.length,
    enabled: skills.filter((skill) => skill.status === "enabled" && skill.valid).length,
    disabled: skills.filter((skill) => skill.status === "disabled").length,
    imported: skills.filter((skill) => skill.source === "imported").length,
    invalid: skills.filter((skill) => !skill.valid).length
  };
}

function countStatusFilters(skills: SkillRecord[]): StatusFilterCounts {
  const counts = countSkills(skills);
  return {
    ...counts,
    all: skills.length,
    effective: counts.enabled
  };
}
