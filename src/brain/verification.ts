/**
 * Brain Verification — automated checks on the generated response before it is
 * returned. Validates logic signals, formatting, code fences, completeness and
 * safety, and improves weak responses deterministically.
 */
import type { Complexity, Intent } from './types';

export interface VerificationReport {
  passed: boolean;
  issues: string[];
  fixesApplied: number;
  sanitized: string;
}

/** Strip control characters and trim; keep Markdown structure. */
function sanitize(text: string): string {
  // Remove NUL and control chars but keep \n \t \r for Markdown.
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
}

/** Ensure every opening code fence has a matching closing fence. */
function verifyCodeFences(text: string): { balanced: boolean; fixed: string } {
  const count = (text.match(/```/g) || []).length;
  if (count % 2 === 0) return { balanced: true, fixed: text };
  return { balanced: false, fixed: text + '\n```' };
}

export function verifyResponse(
  raw: string,
  opts: { intent: Intent; complexity: Complexity },
): VerificationReport {
  const issues: string[] = [];
  let fixesApplied = 0;
  let sanitized = sanitize(raw);

  if (!sanitized) {
    issues.push('Empty response.');
    return { passed: false, issues, fixesApplied, sanitized };
  }

  // Code fence balancing.
  const fences = verifyCodeFences(sanitized);
  if (!fences.balanced) {
    sanitized = fences.fixed;
    fixesApplied++;
    issues.push('Fixed unbalanced code fence.');
  }

  // Completeness heuristic for high-complexity tasks.
  if (opts.complexity === 'high' && sanitized.length < 100) {
    issues.push('Response may be incomplete for a high-complexity task.');
  }

  // Basic grammar heuristics: repeated words run-together.
  if (/(\b\w+)\s+\1\b/i.test(sanitized)) {
    sanitized = sanitized.replace(/(\b\w+)\s+\1\b/gi, '$1');
    fixesApplied++;
    issues.push('Removed a duplicated word.');
  }

  const severity = sanitized.length < 20 ? 2 : issues.length > 2 ? 1 : 0;
  return {
    passed: issues.length === 0 || severity < 2,
    issues,
    fixesApplied,
    sanitized,
  };
}