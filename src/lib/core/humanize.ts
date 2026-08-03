import type { HumanizationResult, HumanizationChange, HumanizationCategory } from './types';
import { orchestrator } from './orchestrator';

const BUZZWORD_PATTERNS = [
  'leverage', 'optimize', 'streamline', 'facilitate', 'foster', 'navigate',
  'delve', 'unlock', 'harness', 'elevate', 'pivotal', 'landscape',
  'ecosystem', 'paradigm', 'robust', 'seamless', 'transformative', 'cutting-edge',
  'game-changing', 'forward-thinking', 'actionable', 'scalable', 'holistic',
  'multifaceted', 'nuanced', 'intricate', 'compelling', 'impactful', 'innovative',
];

const TRANSITION_PATTERNS = [
  'Furthermore', 'Moreover', 'Additionally', 'Nevertheless', 'Consequently',
  'Therefore', 'Thus', 'In contrast', 'As a result', 'In particular',
];

const GENERIC_OPENINGS = [
  "In today's rapidly evolving", "In today's fast-paced", "It is important to note that",
  "It is worth noting that", "It should be noted that", "In this article, we will",
  "This article explores", "The purpose of this", "When it comes to",
];

const BALANCED_STRUCTURE = /^[A-Z][^.]{10,60}\.(?: [A-Z][^.]{10,60}\.){2,4}$/;

export class HumanWritingEngine {
  async humanize(text: string): Promise<HumanizationResult> {
    const patterns = this.detectPatterns(text);
    const response = await orchestrator.route({
      messages: [
        {
          role: 'system',
          content: `You are a human writing expert. Rewrite the given text to sound genuinely human.

Rules:
1. Remove AI buzzwords: ${BUZZWORD_PATTERNS.join(', ')}
2. Replace stiff transitions (${TRANSITION_PATTERNS.join(', ')}) with natural ones (also, plus, but, still, yet, so, anyway)
3. Break balanced sentence structures
4. Replace generic openings with specific ones
5. Vary sentence length - mix short and long sentences
6. Use contractions (don't, can't, it's, you're)
7. Start sentences with "But" or "And" when natural
8. Add specific observations instead of vague statements
9. Keep the original meaning

Respond with JSON: { "humanized": "...", "changes": [{"original":"...","replacement":"...","reason":"...","category":"buzzword|transition|balanced-structure|generic-opening|vague-qualifier|padding|overly-formal|repetitive-pattern"}] }`,
        },
        { role: 'user', content: text },
      ],
      taskCategory: 'writing',
      thinking: true,
    });

    let result: { humanized?: string; changes?: HumanizationChange[] } = {};
    try {
      const cleaned = response.content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      result = JSON.parse(cleaned);
    } catch {
      result = { humanized: response.content, changes: [] };
    }

    return {
      humanized: result.humanized || text,
      changes: result.changes || [],
      patternScore: this.computePatternScore(text),
      readabilityScore: this.computeReadabilityScore(result.humanized || text),
    };
  }

  detectPatterns(text: string): Array<{ pattern: string; category: HumanizationCategory; index: number }> {
    const patterns: Array<{ pattern: string; category: HumanizationCategory; index: number }> = [];

    for (const word of BUZZWORD_PATTERNS) {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      let match;
      while ((match = regex.exec(text)) !== null) {
        patterns.push({ pattern: match[0], category: 'buzzword', index: match.index });
      }
    }

    for (const transition of TRANSITION_PATTERNS) {
      const regex = new RegExp(`\\b${transition}\\b`, 'g');
      let match;
      while ((match = regex.exec(text)) !== null) {
        patterns.push({ pattern: match[0], category: 'transition', index: match.index });
      }
    }

    if (BALANCED_STRUCTURE.test(text)) {
      patterns.push({ pattern: 'Balanced sentence structure detected', category: 'balanced-structure', index: 0 });
    }

    for (const opening of GENERIC_OPENINGS) {
      const idx = text.indexOf(opening);
      if (idx !== -1) {
        patterns.push({ pattern: opening, category: 'generic-opening', index: idx });
      }
    }

    return patterns;
  }

  private computePatternScore(text: string): number {
    let score = 0;
    const lower = text.toLowerCase();

    for (const word of BUZZWORD_PATTERNS) {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      const matches = lower.match(regex);
      if (matches) score += matches.length * 5;
    }

    for (const trans of TRANSITION_PATTERNS) {
      const regex = new RegExp(`\\b${trans.toLowerCase()}\\b`, 'g');
      const matches = lower.match(regex);
      if (matches) score += matches.length * 4;
    }

    if (BALANCED_STRUCTURE.test(text)) score += 15;

    for (const opening of GENERIC_OPENINGS) {
      if (lower.includes(opening.toLowerCase())) score += 10;
    }

    const avgSentenceLen = this.averageSentenceLength(text);
    if (avgSentenceLen > 25 && avgSentenceLen < 35) score += 8;

    return Math.min(100, score);
  }

  private computeReadabilityScore(text: string): number {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    if (sentences.length === 0) return 50;

    const words = text.split(/\s+/).filter(w => w.length > 0);
    if (words.length === 0) return 50;

    const avgWordsPerSentence = words.length / sentences.length;
    const avgWordLength = words.reduce((sum, w) => sum + w.length, 0) / words.length;

    const idealSentenceLen = 15;
    const sentenceScore = Math.max(0, 100 - Math.abs(avgWordsPerSentence - idealSentenceLen) * 3);
    const wordScore = Math.max(0, 100 - Math.abs(avgWordLength - 5) * 20);

    return Math.round((sentenceScore * 0.6 + wordScore * 0.4));
  }

  private averageSentenceLength(text: string): number {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    if (sentences.length === 0) return 0;
    const words = text.split(/\s+/).filter(w => w.length > 0);
    return words.length / sentences.length;
  }
}

export const humanWritingEngine = new HumanWritingEngine();
