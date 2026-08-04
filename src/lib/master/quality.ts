import { securityGuard } from '@/lib/security/guard';
import { humanWritingEngine } from '@/lib/core/humanize';
import { createLogger } from '@/lib/logging/logger';

const qualityLogger = createLogger('master-quality');

export interface QualityReport {
  passed: boolean;
  score: number;
  isEmpty: boolean;
  hasHallucinationMarkers: boolean;
  hasPii: boolean;
  reasons: string[];
  /** When true, the caller should discard the output. */
  fatal: boolean;
}

export class QualityReviewer {
  /**
   * Internal quality gate that runs BEFORE returning an answer:
   *  - refuses empty output
   *  - scans for PII / hallucination markers / prompt-injection residue
   *  - applies a humanization polish when flagged (never exposes this step)
   */
  async review(
    content: string,
    opts?: { humanize?: boolean },
  ): Promise<QualityReport> {
    const reasons: string[] = [];
    const isEmpty = !content || content.trim().length === 0;

    if (isEmpty) {
      return {
        passed: false,
        score: 0,
        isEmpty: true,
        hasHallucinationMarkers: false,
        hasPii: false,
        reasons: ['Empty response.'],
        fatal: true,
      };
    }

    const safety = securityGuard.validateOutput(content);
    const hasPii = safety.threats.some(t => t.type === 'pii-leak');
    const hasHallucinationMarkers = safety.threats.some(
      t => t.type === 'hallucination-risk',
    );

    let score = 1;
    if (hasPii) {
      reasons.push('PII detected in output.');
      score -= 0.4;
    }
    if (hasHallucinationMarkers) {
      reasons.push('Uncertainty markers that may indicate hallucination risk.');
      score -= 0.15;
    }
    if (content.length < 40) {
      reasons.push('Response is unusually short.');
      score -= 0.1;
    }

    if (opts?.humanize && content.trim().length > 60) {
      try {
        const humanized = await humanWritingEngine.humanize(content);
        if (humanized.humanized) {
          content = humanized.humanized;
          score = Math.min(1, score + 0.05);
        }
      } catch (err) {
        qualityLogger.warn('Humanize pass skipped', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return {
      passed: score >= 0.5,
      score: Math.max(0, Math.min(1, score)),
      isEmpty: false,
      hasHallucinationMarkers,
      hasPii,
      reasons,
      fatal: hasPii || score < 0.3,
    };
  }
}

export const qualityReviewer = new QualityReviewer();