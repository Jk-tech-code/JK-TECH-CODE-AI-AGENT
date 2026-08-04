/**
 * Minimal, dependency-free YAML frontmatter parser for skill SKILL.md files.
 * Handles the subset of YAML that actually appears in this repo's skill files:
 * scalar strings, single/double-quoted strings, block scalars, and lists.
 * Returns {} on any input so callers can fall back gracefully.
 */

const FRONTMATTER_RE = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/;

export interface ParsedFrontmatter {
  [key: string]: unknown;
}

function unquote(value: string): string {
  let v = value.trim();
  if (v.length >= 2) {
    const first = v[0];
    const last = v[v.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      v = v.slice(1, -1);
      // Handle the escaped-apostrophe YAML idiom: 'it''s' -> it's
      v = v.replace(/''/g, "'");
    }
  }
  return v;
}

/** Parse a YAML block into a flat object, expanding `key.subkey` for nested maps. */
function parseBlock(block: string): ParsedFrontmatter {
  const out: ParsedFrontmatter = {};
  const lines = block.split(/\r?\n/);
  let i = 0;
  let inBlockScalar: string | null = null;
  const blockScalarLines: string[] = [];

  while (i < lines.length) {
    const line = lines[i];

    if (inBlockScalar) {
      if (/^\S/.test(line)) {
        // Dedent from 6 spaces (the observed indentation) + reassemble.
        const cleaned = line.replace(/^ {0,6}/, '');
        blockScalarLines.push(cleaned);
        i++;
        continue;
      }
      out[inBlockScalar] = blockScalarLines.join(' ').trim();
      inBlockScalar = null;
      blockScalarLines.length = 0;
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) { i++; continue; }
    if (trimmed.startsWith('#')) { i++; continue; }

    const listMatch = trimmed.match(/^-\s+(.+)$/);
    if (listMatch) {
      const key = Object.keys(out).find(k => Array.isArray(out[k]));
      if (key) (out[key] as unknown[]).push(unquote(listMatch[1]));
      else {
        // Anonymous top-level list — assign to a synthetic key 'items'.
        const items = (out.items as unknown[] | undefined) || [];
        items.push(unquote(listMatch[1]));
        out.items = items;
      }
      i++;
      continue;
    }

    const kvMatch = trimmed.match(/^([A-Za-z0-9_.\-]+)\s*:\s*(.*)$/);
    if (!kvMatch) { i++; continue; }
    const rawKey = kvMatch[1];
    let value = kvMatch[2].trim();

    // Block scalar indicator (| >) — capture following indented lines.
    if (/^[|>]/.test(value)) {
      inBlockScalar = rawKey;
      i++;
      continue;
    }

    if (value === '' || value === 'null' || value === '~') {
      out[rawKey] = undefined;
      i++;
      continue;
    }

    // Flow list: [a, b, c]
    if (value.startsWith('[') && value.endsWith(']')) {
      out[rawKey] = value
        .slice(1, -1)
        .split(',')
        .map(s => unquote(s))
        .filter(Boolean);
      i++;
      continue;
    }

    if (/^true$/i.test(value)) { out[rawKey] = true; i++; continue; }
    if (/^false$/i.test(value)) { out[rawKey] = false; i++; continue; }
    if (/^\d+$/.test(value)) { out[rawKey] = Number(value); i++; continue; }
    if (/^\d+\.\d+$/.test(value)) { out[rawKey] = Number(value); i++; continue; }

    out[rawKey] = unquote(value);
    i++;
  }

  if (inBlockScalar) {
    out[inBlockScalar] = blockScalarLines.join(' ').trim();
  }

  return out;
}

/** Parse the frontmatter block of a SKILL.md content string. */
export function parseFrontmatter(content: string): ParsedFrontmatter {
  const match = FRONTMATTER_RE.exec(content || '');
  if (!match) return {};
  try {
    return parseBlock(match[1]);
  } catch {
    return {};
  }
}

/** Read a nested value via a dotted path (e.g. "metadata.tags"). */
export function getPath(obj: ParsedFrontmatter, path: string): unknown {
  let cur: unknown = obj;
  for (const part of path.split('.')) {
    if (cur && typeof cur === 'object' && !Array.isArray(cur)) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return cur;
}

/** Extract the first meaningful description paragraph from a markdown body. */
export function extractBodyDescription(body: string, maxLen = 260): string {
  const lines = (body || '')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 20);
  const first = lines.find(l => !l.startsWith('#') && !l.startsWith('!') && !/^`{3}/.test(l));
  if (!first) return '';
  return first.replace(/^[-*]\s+/, '').slice(0, maxLen);
}