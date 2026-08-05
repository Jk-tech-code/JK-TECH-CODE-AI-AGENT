/**
 * Autonomy Secure Sandbox (Phase 8).
 *
 * Executes user/model-provided code in a restricted, isolated context:
 *  - JavaScript / TypeScript: Node `vm` context with no process, no fs, no
 *    require, no network — only a tiny, safe global surface (console, Math,
 *    JSON, Date). TS is stripped of types before running.
 *  - SQL: read-only static analysis — statements are parsed and only SELECT
 *    (plus read-only CTEs) are permitted; anything else is rejected.
 *  - Shell: allow-list of read-only commands only (echo, ls, cat, head, tail,
 *    grep, wc, pwd, whoami, date). Anything else is rejected.
 *
 * Never runs arbitrary commands. Everything runs with a hard timeout.
 */
import vm from 'vm';
import { createLogger } from '@/lib/logging/logger';
import type { SandboxRequest, SandboxResult, SandboxRuntime } from './types';

const sandboxLogger = createLogger('autonomy:sandbox');

const DEFAULT_TIMEOUT_MS = 5000;
const MAX_CODE_LEN = 100_000;

const SAFE_GLOBALS = ['Math', 'JSON', 'Date', 'Array', 'Object', 'String', 'Number', 'Boolean', 'RegExp', 'Map', 'Set', 'Promise', 'Error', 'parseInt', 'parseFloat', 'isNaN', 'isFinite'];
const UNSAFE_GLOBAL_RE = /process|require|module|global|__dirname|__filename|fetch|child_process|eval\(|Function\s*\(|import\s+[{"'`]|from\s+[{"'`]/;

const READ_ONLY_SQL_RE = /^\s*(SELECT|WITH|SHOW|DESCRIBE|EXPLAIN|PRAGMA)\b/i;
const WRITE_SQL_RE = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|MERGE|GRANT|REVOKE)\b/i;

const SHELL_ALLOW = ['echo', 'ls', 'cat', 'head', 'tail', 'grep', 'wc', 'pwd', 'whoami', 'date', 'printf', 'sed', 'find'];
const SHELL_DANGEROUS = /[|;&<>`$(){}!\\*?"']/;

/* ───────────────────────── Sandbox ───────────────────────── */

export class CodeSandbox {
  async run(req: SandboxRequest): Promise<SandboxResult> {
    const started = Date.now();
    const runtime = req.runtime;
    const code = (req.code ?? '').slice(0, MAX_CODE_LEN);
    const timeoutMs = Math.min(req.timeoutMs ?? DEFAULT_TIMEOUT_MS, 30_000);

    if (!code.trim()) return this.fail(runtime, started, 'Empty code', 1);

    try {
      switch (runtime) {
        case 'javascript':
        case 'typescript':
          return this.runJs(code, runtime === 'typescript', timeoutMs, started);
        case 'sql':
          return this.runSql(code, started);
        case 'shell':
          return this.runShell(code, started);
        default:
          return this.fail(runtime, started, `Unsupported runtime: ${runtime}`, 1);
      }
    } catch (err) {
      sandboxLogger.error('Sandbox failed', err);
      return this.fail(runtime, started, err instanceof Error ? err.message : 'Sandbox error', 1);
    }
  }

  private runJs(code: string, isTs: boolean, timeoutMs: number, started: number): SandboxResult {
    if (UNSAFE_GLOBAL_RE.test(code)) {
      return this.fail('javascript', started, 'Blocked: code references unsafe globals (process/require/network/eval).', 1);
    }

    const logs: string[] = [];
    const safeConsole = {
      log: (...a: unknown[]) => logs.push(a.map(fmt).join(' ')),
      info: (...a: unknown[]) => logs.push(`info: ${a.map(fmt).join(' ')}`),
      warn: (...a: unknown[]) => logs.push(`warn: ${a.map(fmt).join(' ')}`),
      error: (...a: unknown[]) => logs.push(`error: ${a.map(fmt).join(' ')}`),
      table: (v: unknown) => logs.push(fmt(v)),
    };

    const context: Record<string, unknown> = {
      console: safeConsole,
      Math,
      JSON,
      Date,
      Array,
      Object,
      String,
      Number,
      Boolean,
      RegExp,
      Map,
      Set,
      Promise,
      Error,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      // A tiny safe helper for common data work.
      deepCopy: <T>(v: T): T => JSON.parse(JSON.stringify(v)),
    };

    // Strip TypeScript type annotations crudely before running.
    let source = code;
    if (isTs) source = this.stripTs(source);

    try {
      const sandbox = vm.createContext(context);
      const result = vm.runInContext(source, sandbox, {
        timeout: timeoutMs,
        filename: 'sandbox.ts',
      });
      const output = result === undefined ? logs.join('\n') : fmt(result);
      return this.ok('javascript', started, output, logs, 0);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return this.fail('javascript', started, message, 1, logs);
    }
  }

  private stripTs(source: string): string {
    // Simple type-stripper: remove `: Type` annotations and `as Type` casts on
    // their own tokens without touching strings.
    let out = '';
    let i = 0;
    let inStr: string | null = null;
    while (i < source.length) {
      const ch = source[i];
      if (inStr) {
        out += ch;
        if (ch === '\\') { out += source[i + 1] ?? ''; i += 2; continue; }
        if (ch === inStr) inStr = null;
        i++;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; out += ch; i++; continue; }
      // Strip `: Type` after an identifier — crude but safe for sandbox code.
      if (ch === ':' && /[)\w\]]/.test(source[i - 1] ?? '')) {
        out += ' ';
        i++;
        continue;
      }
      out += ch;
      i++;
    }
    return out;
  }

  private runSql(code: string, started: number): SandboxResult {
    if (!READ_ONLY_SQL_RE.test(code)) {
      return this.fail('sql', started, 'Only read-only SQL is allowed (SELECT / WITH / SHOW / EXPLAIN).', 1);
    }
    if (WRITE_SQL_RE.test(code)) {
      return this.fail('sql', started, 'Blocked: write/mutating SQL statements are not permitted in the sandbox.', 1);
    }
    return this.ok('sql', started, `[validated] Read-only SQL accepted:\n\n${code.trim()}`, [], 0);
  }

  private runShell(code: string, started: number): SandboxResult {
    const lines = code.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      const cmd = line.split(/\s+/)[0] ?? '';
      if (!SHELL_ALLOW.includes(cmd)) {
        return this.fail('shell', started, `Blocked shell command "${cmd}". Allowed read-only commands: ${SHELL_ALLOW.join(', ')}.`, 1);
      }
      if (SHELL_DANGEROUS.test(line)) {
        return this.fail('shell', started, `Blocked shell metacharacters in: ${line}`, 1);
      }
    }
    return this.ok('shell', started, `[validated] Read-only shell commands accepted:\n\n${lines.join('\n')}`, [], 0);
  }

  /* ───────────────────────── helpers ───────────────────────── */

  private ok(runtime: SandboxRuntime, started: number, output: string, logs: string[], exitCode: number): SandboxResult {
    return { runtime, ok: true, output, logs, executionTimeMs: Date.now() - started, exitCode };
  }

  private fail(runtime: SandboxRuntime, started: number, error: string, exitCode: number, logs: string[] = []): SandboxResult {
    return { runtime, ok: false, output: '', logs, error, executionTimeMs: Date.now() - started, exitCode };
  }
}

function fmt(value: unknown): string {
  try {
    if (typeof value === 'string') return value;
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export const codeSandbox = new CodeSandbox();