/**
 * Brain Tools — deterministic tools the Brain may invoke automatically.
 *
 * The user never picks a tool: the Brain's intent layer recognizes when a
 * query needs one and `runTool` executes it, injecting the result into the
 * prompt context before the model call. Tools are pure and safe — no arbitrary
 * code execution, no network calls unless the environment is configured for
 * them.
 */
import { createLogger } from '@/lib/logging/logger';

const toolsLogger = createLogger('brain:tools');

export interface ToolResult {
  name: string;
  used: boolean;
  /** Human-readable output to inject into context. */
  output: string;
  latencyMs: number;
}

export interface ToolContext {
  userId?: string;
  query: string;
}

/* ─────────────────────────── Calculator ─────────────────────────── */

const CALC_PATTERN =
  /(?:^|[^a-zA-Z0-9_])([-+]?(?:\d+\.?\d*|\.\d+)(?:\s*[+\-*/%^()]\s*[-+]?(?:\d+\.?\d*|\.\d+))+)/;

/** Safe arithmetic evaluator — no eval(), no functions, no globals. */
function safeEvaluate(expr: string): number | null {
  const tokens = expr.replace(/\s+/g, '').split('');
  const ops: string[] = [];
  const values: number[] = [];
  const precedence: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2, '^': 3 };

  const apply = () => {
    const op = ops.pop();
    const b = values.pop();
    const a = values.pop();
    if (a === undefined || b === undefined || !op) return false;
    switch (op) {
      case '+': values.push(a + b); break;
      case '-': values.push(a - b); break;
      case '*': values.push(a * b); break;
      case '/': if (b === 0) return false; values.push(a / b); break;
      case '%': if (b === 0) return false; values.push(a % b); break;
      case '^': values.push(Math.pow(a, b)); break;
      default: return false;
    }
    return true;
  };

  let i = 0;
  while (i < tokens.length) {
    const ch = tokens[i];
    if (/\d/.test(ch) || (ch === '-' && (i === 0 || tokens[i - 1] === '('))) {
      let num = ch;
      i++;
      while (i < tokens.length && /[\d.]/.test(tokens[i])) { num += tokens[i]; i++; }
      const value = Number(num);
      if (Number.isNaN(value)) return null;
      values.push(value);
      continue;
    }
    if (ch === '(') { ops.push(ch); i++; continue; }
    if (ch === ')') {
      while (ops.length && ops[ops.length - 1] !== '(') {
        if (!apply()) return null;
      }
      if (ops.pop() !== '(') return null;
      i++;
      continue;
    }
    if (precedence[ch]) {
      while (ops.length && ops[ops.length - 1] !== '(' && precedence[ops[ops.length - 1]] >= precedence[ch]) {
        if (!apply()) return null;
      }
      ops.push(ch);
      i++;
      continue;
    }
    return null; // unexpected character
  }

  while (ops.length) {
    if (!apply()) return null;
  }
  if (values.length !== 1) return null;
  return values[0];
}

/** Detect + evaluate an arithmetic expression embedded in a query. */
export function runCalculator(query: string): ToolResult {
  const start = Date.now();
  const match = query.match(CALC_PATTERN);
  if (!match) {
    return { name: 'calculator', used: false, output: '', latencyMs: 0 };
  }
  const expr = match[1].trim();
  const result = safeEvaluate(expr);
  if (result === null) {
    return { name: 'calculator', used: false, output: '', latencyMs: 0 };
  }
  const rounded = Math.abs(result % 1) < 1e-9 && Math.abs(result) < 1e15 ? Math.round(result) : result;
  return {
    name: 'calculator',
    used: true,
    output: `[Tool: calculator] ${expr} = ${rounded}`,
    latencyMs: Date.now() - start,
  };
}

/* ─────────────────────────── Web search ─────────────────────────── */

const SEARCH_HINTS = /\b(search|look up|find|google|what is the latest|current|recent)\b/i;
const SEARCH_URL_PATTERN = /https?:\/\/[^\s]+/i;

/**
 * Web search when a search provider is configured (TAVILY_API_KEY or
 * SERPAPI_API_KEY). Otherwise reports the tool as unavailable so the model
 * answers from its own knowledge without claiming to have browsed.
 */
export async function runWebSearch(query: string): Promise<ToolResult> {
  const start = Date.now();
  const hint = SEARCH_HINTS.test(query) || SEARCH_URL_PATTERN.test(query);
  if (!hint) {
    return { name: 'web_search', used: false, output: '', latencyMs: 0 };
  }

  const tavilyKey = process.env.TAVILY_API_KEY;
  const serpKey = process.env.SERPAPI_API_KEY;
  if (!tavilyKey && !serpKey) {
    return {
      name: 'web_search',
      used: false,
      output: '',
      latencyMs: 0,
    };
  }

  try {
    if (tavilyKey) {
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: tavilyKey, query: query.slice(0, 400), max_results: 3 }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { results?: Array<{ title: string; url: string; content: string }> };
      const results = data.results || [];
      if (results.length === 0) return { name: 'web_search', used: false, output: '', latencyMs: Date.now() - start };
      const output = results
        .map((r) => `- ${r.title} — ${r.url}\n  ${(r.content || '').slice(0, 220)}`)
        .join('\n');
      return {
        name: 'web_search',
        used: true,
        output: `[Tool: web_search] Recent results:\n${output}`,
        latencyMs: Date.now() - start,
      };
    }
    return { name: 'web_search', used: false, output: '', latencyMs: 0 };
  } catch (err) {
    toolsLogger.error('Web search failed', err);
    return { name: 'web_search', used: false, output: '', latencyMs: 0 };
  }
}

/* ─────────────────────────── Dispatcher ─────────────────────────── */

/**
 * Run every tool the Brain thinks applies to this query. Returns the combined
 * context additions (or empty string). Never throws.
 */
export async function runTools(ctx: ToolContext): Promise<string> {
  const results: ToolResult[] = [];
  results.push(runCalculator(ctx.query));
  results.push(await runWebSearch(ctx.query));

  const used = results.filter((r) => r.used);
  if (used.length === 0) return '';
  return used.map((r) => r.output).join('\n');
}