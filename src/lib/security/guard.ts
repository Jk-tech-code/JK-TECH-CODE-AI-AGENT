import type { SecurityReport, SecurityThreat } from '../core/types';

const INJECTION_PATTERNS = [
  { pattern: /ignore\s+(all\s+)?(previous|prior)\s+instructions/i, severity: 'critical' as const },
  { pattern: /forget\s+(all\s+)?(previous|prior)\s+(instructions|prompts)/i, severity: 'critical' as const },
  { pattern: /you\s+are\s+(now|not)\s+/i, severity: 'high' as const },
  { pattern: /system\s+prompt/i, severity: 'high' as const },
  { pattern: /role\s+play/i, severity: 'medium' as const },
  { pattern: /act\s+as\s+if/i, severity: 'medium' as const },
  { pattern: /do\s+not\s+(follow|obey)/i, severity: 'high' as const },
  { pattern: /ignore\s+(all\s+)?(safety|ethical|guidelines|rules)/i, severity: 'critical' as const },
  { pattern: /you\s+don'?t\s+have\s+to\s+(follow|obey)/i, severity: 'high' as const },
  { pattern: /overwrite\s+(your\s+)?(previous|prior)\s+(instructions|prompts)/i, severity: 'critical' as const },
];

const URL_PATTERNS = [
  /https?:\/\/(?:[^\s]+\.)?(?:phishing|malware|hack|cheat|scam|fraud)[^\s]*/i,
  /https?:\/\/(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\//,
  /https?:\/\/bit\.ly\/[^\s]+/i,
  /https?:\/\/tinyurl\.com\/[^\s]+/i,
];

const PII_PATTERNS = [
  /\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/,
  /\b\d{4}[-.\s]?\d{4}[-.\s]?\d{4}[-.\s]?\d{4}\b/,
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
  /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/,
];

const HALLUCINATION_MARKERS = [
  /\bI\s+(think|believe|guess|suppose)\s+(that\s+)?/i,
  /\b(as\s+)?far\s+as\s+I\s+know\b/i,
  /\bI\s+(could|cannot|can'?t)\s+(verify|confirm)\b/i,
  /\b(possibly|perhaps|maybe|likely)\s+(the\s+)?(result|answer|conclusion)\b/i,
];

export class SecurityGuard {
  analyzePrompt(input: string): SecurityReport {
    const threats: SecurityThreat[] = [];

    const injectionThreat = this.checkPromptInjection(input);
    if (injectionThreat) threats.push(injectionThreat);

    const urlThreats = this.checkMaliciousUrls(input);
    threats.push(...urlThreats);

    const piiThreat = this.checkPiiLeak(input);
    if (piiThreat) threats.push(piiThreat);

    const score = this.computeSafetyScore(threats);

    return {
      isSafe: threats.length === 0 || threats.every(t => t.severity === 'low'),
      threats,
      score,
    };
  }

  analyzeRagSource(source: string): SecurityReport {
    const threats: SecurityThreat[] = [];

    if (this.containsInjection(source)) {
      threats.push({
        type: 'rag-poisoning',
        severity: 'critical',
        detail: 'RAG source contains potential prompt injection content',
      });
    }

    return {
      isSafe: threats.length === 0,
      threats,
      score: threats.length === 0 ? 1 : 0.3,
    };
  }

  validateOutput(output: string): SecurityReport {
    const threats: SecurityThreat[] = [];

    const hallucinationRisk = this.checkHallucinationRisk(output);
    if (hallucinationRisk) threats.push(hallucinationRisk);

    const piiThreat = this.checkPiiLeak(output);
    if (piiThreat) threats.push(piiThreat);

    return {
      isSafe: threats.length === 0,
      threats,
      score: this.computeSafetyScore(threats),
    };
  }

  private checkPromptInjection(input: string): SecurityThreat | null {
    for (const { pattern, severity } of INJECTION_PATTERNS) {
      if (pattern.test(input)) {
        return {
          type: 'prompt-injection',
          severity,
          detail: `Detected prompt injection attempt matching pattern: ${pattern.source}`,
        };
      }
    }
    return null;
  }

  private containsInjection(input: string): boolean {
    return INJECTION_PATTERNS.some(({ pattern }) => pattern.test(input));
  }

  private checkMaliciousUrls(input: string): SecurityThreat[] {
    const threats: SecurityThreat[] = [];

    for (const pattern of URL_PATTERNS) {
      const match = input.match(pattern);
      if (match) {
        threats.push({
          type: 'malicious-url',
          severity: 'high',
          detail: `Suspicious URL detected: ${match[0]}`,
          location: match[0],
        });
      }
    }

    return threats;
  }

  private checkPiiLeak(input: string): SecurityThreat | null {
    for (const pattern of PII_PATTERNS) {
      if (pattern.test(input)) {
        return {
          type: 'pii-leak',
          severity: 'high',
          detail: 'Potential PII detected in input/output',
        };
      }
    }
    return null;
  }

  private checkHallucinationRisk(output: string): SecurityThreat | null {
    for (const pattern of HALLUCINATION_MARKERS) {
      if (pattern.test(output)) {
        return {
          type: 'hallucination-risk',
          severity: 'medium',
          detail: 'Output contains uncertainty markers that may indicate hallucination risk',
        };
      }
    }
    return null;
  }

  private computeSafetyScore(threats: SecurityThreat[]): number {
    if (threats.length === 0) return 1;

    const severityWeights: Record<string, number> = {
      low: 0.25,
      medium: 0.5,
      high: 0.75,
      critical: 1.0,
    };

    const maxSeverity = Math.max(
      ...threats.map(t => severityWeights[t.severity] || 0)
    );

    return Math.max(0, 1 - maxSeverity);
  }

  sanitizeInput(input: string): string {
    let sanitized = input;
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
    sanitized = sanitized.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    sanitized = sanitized.slice(0, 100000);
    return sanitized;
  }

  extractUrls(text: string): string[] {
    const urlRegex = /https?:\/\/[^\s<>"']+/g;
    return [...new Set(text.match(urlRegex) || [])];
  }

  isUrlSafe(url: string): boolean {
    return !URL_PATTERNS.some(pattern => pattern.test(url));
  }
}

export const securityGuard = new SecurityGuard();
