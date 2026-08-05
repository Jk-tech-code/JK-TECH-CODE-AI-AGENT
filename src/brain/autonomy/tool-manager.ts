/**
 * Autonomy Tool Manager (Phase 3).
 *
 * A declarative, pluggable registry of tools the Brain can invoke. Each tool
 * declares its id, capabilities, detection patterns and I/O schema. The Brain
 * decides when a query needs a tool; `runApplicableTools` auto-runs matching
 * tools and injects results into context (never shown to the user).
 *
 * Tools are deterministic and safe — no writes, no network unless configured.
 */
import { createLogger } from '@/lib/logging/logger';
import { runCalculator, runWebSearch } from '@/brain/tools';
import type { ToolDefinition, ToolOutput, ToolRunContext, ToolSchema } from './types';
import type { ExtractionResult } from '@/lib/rag/extract';

const toolsLogger = createLogger('autonomy:tools');

const objectOf = (
  properties: Record<string, { type: string; description?: string }>,
  required?: string[],
): ToolSchema => ({ type: 'object', properties, required });

const TOOLS: ToolDefinition[] = [
  {
    id: 'calculator',
    name: 'Calculator',
    description: 'Safely evaluates arithmetic expressions.',
    capabilities: ['arithmetic', 'math'],
    inputSchema: objectOf({ expression: { type: 'string', description: 'Arithmetic expression' } }),
    outputSchema: objectOf({ result: { type: 'string' } }),
    userInvokable: true,
    run: async (input) => {
      const expression = String(input.expression ?? '');
      const res = runCalculator(expression);
      return {
        content: res.output,
        used: res.used,
        latencyMs: res.latencyMs,
        toolId: 'calculator',
        data: res.used ? { result: res.output.replace('[Tool: calculator] ', '') } : undefined,
      };
    },
  },
  {
    id: 'web_search',
    name: 'Web Search',
    description: 'Searches the web for recent information when a search provider is configured.',
    capabilities: ['search', 'research'],
    userInvokable: true,
    run: async (input) => {
      const out = await runWebSearch(String(input.query ?? ''));
      return {
        content: out.output,
        used: out.used,
        latencyMs: out.latencyMs,
        toolId: 'web_search',
        data: out.used ? { searched: String(input.query ?? '') } : undefined,
      };
    },
  },
  {
    id: 'file_reader',
    name: 'File Reader',
    description: 'Extracts text from uploaded files (PDF, DOCX, XLSX, TXT).',
    capabilities: ['document', 'pdf', 'word', 'excel', 'extract'],
    userInvokable: true,
    run: async (input) => {
      const start = Date.now();
      const rawContent = String(input.content ?? '');
      const rawBuffer = input.buffer as { data?: number[] } | undefined;
      const fileType = String(input.fileType ?? 'txt');
      let text = rawContent;
      if (!text && rawBuffer) {
        // Decode a base64/binary buffer payload straight into text.
        if (isBufferLike(rawBuffer)) text = bufferToText(rawBuffer.data as number[]);
        else {
          try {
            const { extractFileText } = await import('@/lib/rag/extract');
            const buf = Buffer.from(rawBuffer.data ?? []);
            const res: ExtractionResult = await extractFileText(buf, fileType);
            text = res.content ?? '';
          } catch {
            text = '';
          }
        }
      }
      const used = text.length > 0;
      return {
        content: `[Tool: file_reader] extracted ${text.length} chars\n${text.slice(0, 4000)}`,
        used,
        latencyMs: Date.now() - start,
        toolId: 'file_reader',
        data: { length: text.length, preview: text.slice(0, 200) },
      };
    },
  },
  {
    id: 'csv_analyzer',
    name: 'CSV Analyzer',
    description: 'Parses CSV text, computes row/column counts and returns a compact preview.',
    capabilities: ['data', 'csv', 'analysis'],
    userInvokable: true,
    run: async (input) => {
      const start = Date.now();
      const csv = String(input.csv ?? input.content ?? '');
      const rows = splitCsv(csv);
      const header = rows[0] ?? [];
      const body = rows.slice(1);
      const used = rows.length > 0;
      let content = '';
      if (used) {
        content = `[Tool: csv_analyzer] ${rows.length} rows, ${header.length} columns.\nHeader: ${header.join(' | ')}\n${body
          .slice(0, 5)
          .map((r) => r.join(' | '))
          .join('\n')}`;
      }
      return {
        content,
        used,
        latencyMs: Date.now() - start,
        toolId: 'csv_analyzer',
        data: { rows: rows.length, columns: header.length, header },
      };
    },
  },
  {
    id: 'json_parser',
    name: 'JSON Parser',
    description: 'Parses and validates JSON, returning a usable summary.',
    capabilities: ['data', 'json', 'parse'],
    userInvokable: true,
    run: async (input) => {
      const start = Date.now();
      const raw = String(input.json ?? input.content ?? '');
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return { content: '[Tool: json_parser] Invalid JSON.', used: false, latencyMs: Date.now() - start, toolId: 'json_parser' };
      }
      return {
        content: `[Tool: json_parser] Valid JSON. ${describeJson(parsed)}`,
        used: true,
        latencyMs: Date.now() - start,
        toolId: 'json_parser',
        data: parsed,
      };
    },
  },
  {
    id: 'markdown_parser',
    name: 'Markdown Parser',
    description: 'Extracts headings, links and a text summary from Markdown.',
    capabilities: ['markdown', 'document'],
    userInvokable: true,
    run: async (input) => {
      const start = Date.now();
      const md = String(input.markdown ?? input.content ?? '');
      const headings = [...md.matchAll(/^(#{1,6})\s+(.+)$/gm)].map((m) => `${'#'.repeat(m[1].length)} ${m[2]}`);
      const links = [...md.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)].map((m) => `${m[1]} -> ${m[2]}`);
      const plain = md.replace(/[#>*`_~-]/g, ' ').replace(/\s+/g, ' ').trim();
      return {
        content: `[Tool: markdown_parser] ${headings.length} headings, ${links.length} links.\n${headings.join('\n') || plain.slice(0, 300)}`,
        used: md.length > 0,
        latencyMs: Date.now() - start,
        toolId: 'markdown_parser',
        data: { headings, links, chars: md.length },
      };
    },
  },
];

/* ───────────────────────── Helpers ───────────────────────── */

function isBufferLike(b: { data?: number[] }): boolean {
  return Array.isArray(b.data) && b.data.length > 0 && b.data.every((n) => typeof n === 'number');
}

function bufferToText(data: number[]): string {
  const bytes = new Uint8Array(data);
  // Try UTF-8 text decode for small buffers; fall back to empty for binary.
  if (bytes.length > 2_000_000) return '';
  let s = '';
  try {
    s = new TextDecoder('utf-8').decode(bytes);
  } catch {
    s = '';
  }
  return s.replace(/\uFFFD/g, '').trim() ? s : '';
}

function splitCsv(csv: string): string[][] {
  if (!csv) return [];
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    if (ch === '"') {
      if (inQ && csv[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      row.push(cur); cur = '';
    } else if ((ch === '\n' || ch === '\r') && !inQ) {
      if (ch === '\r' && csv[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else {
      cur += ch;
    }
  }
  row.push(cur);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows.filter((r) => r.join('').trim() !== '');
}

function describeJson(value: unknown): string {
  if (Array.isArray(value)) return `Array of ${value.length} elements.`;
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>);
    return `Object with ${keys.length} keys: ${keys.slice(0, 8).join(', ')}${keys.length > 8 ? ', …' : ''}.`;
  }
  return `Primitive ${typeof value}.`;
}

/* ───────────────────────── Registry ───────────────────────── */

export class ToolManager {
  private defs = new Map<string, ToolDefinition>();
  private calls = new Map<string, { count: number; failures: number; lastMs: number }>();

  constructor() {
    for (const def of TOOLS) this.register(def);
  }

  register(def: ToolDefinition): void {
    this.defs.set(def.id, def);
    if (!this.calls.has(def.id)) this.calls.set(def.id, { count: 0, failures: 0, lastMs: 0 });
  }

  get(id: string): ToolDefinition | undefined {
    return this.defs.get(id);
  }

  all(): ToolDefinition[] {
    return [...this.defs.values()];
  }

  has(id: string): boolean {
    return this.defs.has(id);
  }

  /** Run tools whose detection patterns match the query; combine results. */
  async runForTools(query: string, ctx: ToolRunContext = {}): Promise<string> {
    const outputs = await this.invokeMatching(query, ctx);
    const used = outputs.filter((o) => o.used);
    if (used.length === 0) return '';
    return used.map((o) => o.content).join('\n\n');
  }

  /** Pick and invoke every tool that matches the query's trigger patterns. */
  async invokeMatching(query: string, ctx: ToolRunContext = {}): Promise<ToolOutput[]> {
    const results: ToolOutput[] = [];
    for (const def of this.defs.values()) {
      if (!def.triggerPatterns || def.triggerPatterns.length === 0) continue;
      const match = def.triggerPatterns.some((re) => re.test(query));
      if (match) {
        results.push(await this.invoke(def.id, { expression: query, query, content: query }, ctx));
      }
    }
    return results;
  }

  /** Invoke a tool by id. Never throws. */
  async invoke(id: string, input: Record<string, unknown>, ctx: ToolRunContext = {}): Promise<ToolOutput> {
    const def = this.defs.get(id);
    const stat = this.calls.get(id) ?? { count: 0, failures: 0, lastMs: 0 };
    stat.count++;
    stat.lastMs = Date.now();
    if (!def) {
      stat.failures++;
      this.calls.set(id, stat);
      return { content: `Unknown tool: ${id}`, used: false, latencyMs: 0, toolId: id };
    }
    try {
      const out = await def.run(input, ctx);
      this.calls.set(id, stat);
      return out;
    } catch (err) {
      stat.failures++;
      this.calls.set(id, stat);
      toolsLogger.error(`Tool ${id} failed`, err);
      return { content: `[Tool: ${id}] Error: ${err instanceof Error ? err.message : 'failed'}`, used: false, latencyMs: 0, toolId: id };
    }
  }

  /** Health summary for observability. */
  health(): Array<{ id: string; name: string; ok: boolean; calls: number; failures: number }> {
    return [...this.defs.values()].map((d) => {
      const s = this.calls.get(d.id) ?? { count: 0, failures: 0, lastMs: 0 };
      return { id: d.id, name: d.name, ok: s.failures === 0, calls: s.count, failures: s.failures };
    });
  }
}

/** Shared singleton used across routes. */
export const toolManager = new ToolManager();