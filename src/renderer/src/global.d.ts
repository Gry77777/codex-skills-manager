import type { AiApi, SkillsApi } from "../../shared/types";

declare global {
  interface Window {
    skills: SkillsApi;
    ai: AiApi;
  }
}
