export type Frontmatter = {
  name?: string;
  description?: string;
  valid: boolean;
};

export function parseFrontmatter(markdown: string): Frontmatter {
  if (!markdown.startsWith("---")) {
    return { valid: false };
  }

  const end = markdown.indexOf("\n---", 3);
  if (end === -1) {
    return { valid: false };
  }

  const block = markdown.slice(3, end).trim();
  const values: Record<string, string> = {};

  for (const line of block.split(/\r?\n/)) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    values[key] = rawValue.replace(/^["']|["']$/g, "").trim();
  }

  return {
    name: values.name,
    description: values.description,
    valid: true
  };
}
