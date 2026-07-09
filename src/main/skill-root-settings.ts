import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { CustomSkillRoot, SkillRootSettingsInput, SkillRootSettingsView } from "../shared/types.js";
import { getSkillRootSettingsPath } from "./paths.js";

type SkillRootSettingsFile = {
  version: 1;
  customRoots: CustomSkillRoot[];
};

export class SkillRootSettingsStore {
  constructor(private readonly settingsPath = getSkillRootSettingsPath()) {}

  async read(): Promise<SkillRootSettingsView> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.settingsPath, "utf8")) as SkillRootSettingsFile;
      if (parsed.version !== 1 || !Array.isArray(parsed.customRoots)) {
        return emptySettings();
      }

      return {
        customRoots: parsed.customRoots.map(normalizeStoredRoot).filter((root): root is CustomSkillRoot => Boolean(root))
      };
    } catch {
      return emptySettings();
    }
  }

  async save(input: SkillRootSettingsInput): Promise<SkillRootSettingsView> {
    const seen = new Set<string>();
    const customRoots = input.customRoots.flatMap((root) => {
      const normalizedPath = root.path.trim() ? path.resolve(root.path.trim()) : "";
      const key = normalizedPath.toLowerCase();
      if (!normalizedPath || seen.has(key)) {
        return [];
      }

      seen.add(key);
      return [
        {
          id: buildCustomRootId(normalizedPath),
          path: normalizedPath,
          label: root.label?.trim() || undefined,
          enabled: root.enabled ?? true
        }
      ];
    });

    const settings = { customRoots };
    await fs.mkdir(path.dirname(this.settingsPath), { recursive: true });
    await fs.writeFile(
      this.settingsPath,
      `${JSON.stringify({ version: 1, customRoots }, null, 2)}\n`,
      "utf8"
    );
    return settings;
  }
}

export function buildCustomRootId(rootPath: string): string {
  return `custom-${crypto.createHash("sha256").update(path.resolve(rootPath).toLowerCase()).digest("hex").slice(0, 12)}`;
}

function normalizeStoredRoot(root: Partial<CustomSkillRoot>): CustomSkillRoot | null {
  if (!root.path?.trim()) {
    return null;
  }

  const normalizedPath = path.resolve(root.path.trim());
  return {
    id: root.id || buildCustomRootId(normalizedPath),
    path: normalizedPath,
    label: root.label?.trim() || undefined,
    enabled: root.enabled ?? true
  };
}

function emptySettings(): SkillRootSettingsView {
  return { customRoots: [] };
}
