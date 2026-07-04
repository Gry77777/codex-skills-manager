import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SkillMarketplace } from "../src/main/skill-marketplace.js";
import type { MarketplaceSkill } from "../src/shared/types.js";

describe("SkillMarketplace", () => {
  const originalFetch = global.fetch;
  let root: string;
  let cachePath: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "skills-marketplace-"));
    cachePath = path.join(root, "marketplace-cache.json");
  });

  afterEach(async () => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
    await fs.rm(root, { recursive: true, force: true });
  });

  it("opens from local cache state without touching the network", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as typeof fetch;

    const marketplace = new SkillMarketplace(cachePath);
    const result = await marketplace.search({ limit: 20 });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.items).toEqual([]);
    expect(result.sources.find((source) => source.id === "composio-awesome-codex-skills")?.status).toBe("not-indexed");
    expect(result.sources.find((source) => source.id === "awesome-skills")?.status).toBe("external");
  });

  it("refreshes only the requested source and makes its cached skills searchable", async () => {
    global.fetch = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/repos/ComposioHQ/awesome-codex-skills/git/trees/")) {
        return jsonResponse({
          tree: [
            { path: "skills/github-review/SKILL.md", type: "blob" },
            { path: "docs/readme.md", type: "blob" }
          ]
        });
      }

      if (url.includes("/repos/ComposioHQ/awesome-codex-skills")) {
        return jsonResponse(repositoryPayload("ComposioHQ/awesome-codex-skills"));
      }

      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;

    const marketplace = new SkillMarketplace(cachePath);
    const result = await marketplace.refreshSource("composio-awesome-codex-skills", {
      sourceId: "composio-awesome-codex-skills",
      limit: 20
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].sourceId).toBe("composio-awesome-codex-skills");
    expect(result.items[0].name).toBe("Github Review");
    expect(result.sources.find((source) => source.id === "composio-awesome-codex-skills")?.status).toBe("ready");

    const cachedSearch = await marketplace.search({ query: "github", sourceId: "composio-awesome-codex-skills" });
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(cachedSearch.items.map((item) => item.name)).toEqual(["Github Review"]);
  });

  it("keeps source filters isolated in cached search results", async () => {
    await writeCache(cachePath, [
      cachedSkill("one", "browser-helper", "composio-awesome-codex-skills", "Composio Awesome Codex Skills"),
      cachedSkill("two", "browser-helper", "awesome-claude-skills", "Awesome Claude Skills")
    ]);

    const fetchMock = vi.fn();
    global.fetch = fetchMock as typeof fetch;

    const marketplace = new SkillMarketplace(cachePath);
    const composio = await marketplace.search({ query: "browser", sourceId: "composio-awesome-codex-skills" });
    const claude = await marketplace.search({ query: "browser", sourceId: "awesome-claude-skills" });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(composio.items.map((item) => item.id)).toEqual(["one"]);
    expect(claude.items.map((item) => item.id)).toEqual(["two"]);
  });

  it("records source-level errors without breaking the marketplace result", async () => {
    global.fetch = vi.fn(async () =>
      new Response("rate limited", {
        status: 403,
        statusText: "Forbidden"
      })
    ) as typeof fetch;

    const marketplace = new SkillMarketplace(cachePath);
    const result = await marketplace.refreshSource("composio-awesome-codex-skills", {
      sourceId: "composio-awesome-codex-skills"
    });
    const source = result.sources.find((candidate) => candidate.id === "composio-awesome-codex-skills");

    expect(source?.status).toBe("error");
    expect(source?.error).toContain("403");
    expect(result.items).toEqual([]);
  });
});

function repositoryPayload(fullName: string): unknown {
  return {
    full_name: fullName,
    html_url: `https://github.com/${fullName}`,
    description: "A curated skill repository",
    stargazers_count: 15000,
    forks_count: 200,
    updated_at: "2026-07-03T00:00:00.000Z",
    default_branch: "main",
    language: "Python",
    topics: ["codex", "skills"]
  };
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

async function writeCache(cachePath: string, items: MarketplaceSkill[]): Promise<void> {
  const sourceIndexes: Record<string, { sourceId: string; fetchedAt: number; items: MarketplaceSkill[] }> = {};
  for (const item of items) {
    const sourceIndex = sourceIndexes[item.sourceId] ?? {
      sourceId: item.sourceId,
      fetchedAt: Date.now(),
      items: []
    };
    sourceIndex.items.push(item);
    sourceIndexes[item.sourceId] = sourceIndex;
  }

  await fs.writeFile(
    cachePath,
    `${JSON.stringify({ version: 2, fetchedAt: Date.now(), sourceIndexes }, null, 2)}\n`,
    "utf8"
  );
}

function cachedSkill(id: string, name: string, sourceId: string, sourceName: string): MarketplaceSkill {
  return {
    id,
    name,
    description: "Cached skill",
    repository: "owner/repo",
    sourceId,
    sourceName,
    sourceUrl: `https://github.com/owner/repo/tree/main/${id}`,
    installUrl: `https://github.com/owner/repo/tree/main/${id}`,
    stars: 10,
    forks: 1,
    updatedAt: "2026-07-03T00:00:00.000Z",
    language: "TypeScript",
    tags: ["browser"]
  };
}
