import type {
  Domain,
  Intent,
  MasterAnalysis,
  OutputFormat,
} from './types';
import { securityGuard } from '@/lib/security/guard';

/* ────────────────────────────────────────────
 *  Heuristic keyword tables
 * ──────────────────────────────────────────── */

const DOMAIN_KEYWORDS: Record<Domain, string[]> = {
  coding: ['code', 'bug', 'debug', 'function', 'api', 'syntax', 'compile', 'react', 'typescript', 'javascript', 'python', 'backend', 'frontend', 'database', 'sql', 'docker', 'git', 'deploy', 'script', 'algorithm', 'refactor', 'http', 'endpoint', 'program', 'test case'],
  research: ['research', 'investigate', 'find out', 'study', 'source', 'evidence', 'statistics', 'data on', 'history of', 'latest', 'current', 'update', 'recent', 'compare findings', 'paper', 'analysis of'],
  writing: ['write', 'essay', 'article', 'blog', 'email', 'letter', 'post', 'story', 'copy', 'intro', 'outline', 'headline', 'script', 'poem', 'caption', 'paragraph', 'draft'],
  marketing: ['marketing', 'campaign', 'brand', 'seo', 'audience', 'funnel', 'conversion', 'ads', 'copywriting', 'content strategy', 'growth', 'pricing', 'launch plan'],
  strategy: ['strategy', 'roadmap', 'plan', 'goals', 'objectives', 'swot', 'competitive', 'positioning', 'business', 'growth plan', 'prioritize', 'milestone'],
  data: ['data', 'dataset', 'chart', 'dashboard', 'statistics', 'analyze', 'trend', 'forecast', 'correlation', 'excel', 'csv', 'pivot', 'regression', 'visualization'],
  document: ['document', 'report', 'pdf', 'word', 'docx', 'contract', 'proposal', 'summary', 'minutes', 'policy', 'resume file', 'manual'],
  resume: ['resume', 'cv', 'curriculum', 'career', 'job application', 'linkedin', 'cover letter', 'interview'],
  presentation: ['presentation', 'slides', 'slide deck', 'powerpoint', 'pptx', 'pitch deck', 'deck', 'keynote'],
  spreadsheet: ['spreadsheet', 'worksheet', 'workbook', 'pivot table', 'vlookup', 'formula', 'scheduler', 'budget tracker', 'inventory sheet'],
  image: ['image', 'photo', 'picture', 'design', 'logo', 'banner', 'poster', 'infographic', 'thumbnail', 'draw', 'illustration'],
  finance: ['finance', 'budget', 'invest', 'stock', 'revenue', 'profit', 'cash flow', 'tax', 'loan', 'cost', 'expense', 'roi', 'valuation'],
  education: ['explain', 'teach', 'learn', 'lesson', 'tutorial', 'guide', 'how does', 'what is', 'understand', 'example of', 'definition'],
  general: [],
};

const INTENT_KEYWORDS: Record<Intent, string[]> = {
  explain: ['explain', 'what is', 'what are', 'how does', 'how do', 'why', 'define', 'describe', 'meaning of', 'in simple terms'],
  summarize: ['summarize', 'summary', 'tl;dr', 'key points', 'in short', 'brief', 'digest', 'recap', 'overview'],
  generate: ['generate', 'create', 'make me', 'build', 'produce', 'construct', 'compose'],
  write: ['write', 'write me', 'draft', 'email', 'essay', 'blog post', 'article', 'letter', 'poem', 'story', 'headline'],
  analyze: ['analyze', 'analysis', 'evaluate', 'assess', 'examine', 'compare', 'pros and cons', 'break down', 'review'],
  compare: ['compare', 'vs', 'versus', 'difference between', 'which is better', 'better than'],
  research: ['research', 'investigate', 'find out', 'look up', 'search', 'is it true', 'latest', 'current', 'what is the newest'],
  code: ['code', 'write code', 'function', 'bug', 'debug', 'fix error', 'refactor', 'implement', 'api endpoint', 'syntax'],
  plan: ['plan', 'roadmap', 'strategy', 'schedule', 'timeline', 'next steps', 'how should i', 'approach'],
  verify: ['verify', 'fact-check', 'is this accurate', 'confirm', 'true or false', 'check if', 'proof'],
  rewrite: ['rewrite', 'rephrase', 'paraphrase', 'humanize', 'make it sound', 'improve this', 'better wording'],
  brainstorm: ['brainstorm', 'ideas for', 'ideas on', 'suggest', 'suggestions', 'inspiration', 'angle'],
  translate: ['translate', 'in french', 'in spanish', 'in swahili', 'in german', 'into japanese', 'into chinese', 'in korean'],
  format: ['format', 'convert to table', 'as json', 'as csv', 'bullets', 'list', 'format as', 'restructure'],
  general: [],
};

const FORMAT_SIGNALS: Array<{ format: Exclude<OutputFormat, 'auto'>; keywords: string[]; regex: RegExp }> = [
  { format: 'table', keywords: ['table', 'side-by-side', 'columns', 'spreadsheet format'], regex: /\b(as|in|to) a table\b/i },
  { format: 'list', keywords: ['bullet list', 'bulleted', 'numbered list', 'steps', 'list'], regex: /\b(as|in) (a )?(bullet|numbered)? ?list\b/i },
  { format: 'json', keywords: ['json', 'json object'], regex: /\b(as|in) json\b/i },
  { format: 'table', keywords: ['csv'], regex: /\b(as|in) csv\b/i },
  { format: 'email', keywords: ['email', 'e-mail', 'reply'], regex: /(write|draft) (an|a) (professional |formal |email|e-mail)/i },
  { format: 'report', keywords: ['report', 'write-up'], regex: /\b(as a|in a|in the form of a) report\b/i },
  { format: 'essay', keywords: ['essay'], regex: /\b(as an|in) essay\b/i },
  { format: 'checklist', keywords: ['checklist', 'check-list', 'to-do'], regex: /\b(as a|in a) checklist\b/i },
  { format: 'summary', keywords: ['summary', 'summarize', 'tl;dr'], regex: /\b(as a|in a) summary\b/i },
  { format: 'code', keywords: ['snippet', 'code block', 'implementation'], regex: /\b(as|in) (a )?code (language)?\b/i },
];

const PERSONA_BY_DOMAIN: Record<Domain, string> = {
  coding: 'Senior Software Engineer',
  research: 'Research Analyst',
  writing: 'Professional Copywriter',
  marketing: 'Marketing Strategist',
  strategy: 'Business Consultant',
  data: 'Data Scientist',
  document: 'Document Specialist',
  resume: 'Career Advisor',
  presentation: 'Presentation Designer',
  spreadsheet: 'Spreadsheet & BI Expert',
  image: 'Creative Director',
  finance: 'Financial Consultant',
  education: 'Professional Teacher',
  general: 'Assistant',
};

/** Signals that a request needs live web search. */
const SEARCH_SIGNALS = [
  /\b(latest|current|recent|newest|update)\b/i,
  /\b(price|cost|today|this year|2025|2026)\b/i,
  /\b(is it true|does it still|how much is)\b/i,
  /\b(research|investigate|find out|look up|news)\b/i,
];

/** Signals that a request is complex / multi-step. */
const COMPLEXITY_SIGNALS = [
  /\b(step by step|multi-s?tep|roadmap|plan|strategy|comprehensive|detailed|end.to.end|production|architecture)\b/i,
  /\b(compare|analyze|evaluate|assess|design|build|implement)\b/i,
];

/* ────────────────────────────────────────────
 *  PromptAnalyzer
 * ──────────────────────────────────────────── */

export class PromptAnalyzer {
  /**
   * Analyze a raw prompt and produce a structured, enhanced analysis.
   * This is deterministic (no model call) so routing is fast, cheap and safe.
   */
  analyze(raw: string, addMeta?: { needsHumanize?: boolean }): MasterAnalysis {
    const sanitized = securityGuard.sanitizeInput(raw) || '';
    const trimmed = sanitized.trim();

    const domainScores = this.scoreDomains(trimmed);
    const domains = this.resolveDomains(domainScores);

    const intent = this.resolveIntent(trimmed, domains[0]);
    const outputFormat = this.resolveFormat(trimmed);
    const persona = PERSONA_BY_DOMAIN[domains[0] || 'general'];

    const detectedKeywords = this.collectKeywords(trimmed);

    const needsSearch = this.needsSearch(trimmed, domains[0], intent);
    const needsReasoning = this.needsReasoning(trimmed, domains[0], intent);
    const needsHumanize =
      addMeta?.needsHumanize !== undefined
        ? addMeta.needsHumanize
        : this.needsHumanize(trimmed, intent);

    const isComplex = COMPLEXITY_SIGNALS.some(r => r.test(trimmed)) || domains.length >= 2;
    const multiDomain = domains.length > 1;

    const enhancedPrompt = this.enhance(trimmed, outputFormat, intent);

    return {
      rawPrompt: trimmed,
      enhancedPrompt,
      intent,
      intentConfidence: this.intentConfidence(trimmed),
      domains,
      domainConfidence: domainScores,
      primaryDomain: domains[0] || 'general',
      outputFormat,
      needsSearch,
      needsReasoning,
      needsHumanize,
      isComplex,
      multiDomain,
      detectedKeywords,
      persona,
    };
  }

  /* ─── scoring ─── */

  private scoreDomains(text: string): Record<Domain, number> {
    const scores = {} as Record<Domain, number>;
    const lower = text.toLowerCase();
    for (const domain of Object.keys(DOMAIN_KEYWORDS) as Domain[]) {
      scores[domain] = 0;
    }
    for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
      let score = 0;
      for (const kw of keywords) {
        if (kw.includes(' ')) {
          if (lower.includes(kw)) score += 3;
        } else if (new RegExp(`\\b${this.escape(kw)}\\b`, 'i').test(lower)) {
          score += 2;
        }
      }
      scores[domain as Domain] = score;
    }
    // A general/education fallback nudge so empty prompts don't underweight.
    return scores;
  }

  private resolveDomains(scores: Record<Domain, number>): Domain[] {
    const sorted = (Object.entries(scores) as Array<[Domain, number]>)
      .filter(([, s]) => s > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([d]) => d);
    if (sorted.length === 0) return ['general'];
    // Keep top 2 when there is a meaningful gap, else return general+coding.
    return sorted.slice(0, 2);
  }

  private resolveIntent(text: string, primaryDomain: Domain): Intent {
    const lower = text.toLowerCase();
    let best: Intent = 'general';
    let bestScore = 0;

    for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
      let score = 0;
      for (const kw of keywords) {
        if (kw.includes(' ')) {
          if (lower.includes(kw)) score += 2;
        } else if (new RegExp(`\\b${this.escape(kw)}\\b`, 'i').test(lower)) {
          score += 1;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        best = intent as Intent;
      }
    }

    // Domain-informed corrections: a "write code" prompt is code even if "write" matches first.
    if (primaryDomain === 'coding' && /code|function|debug|syntax|api/.test(lower) && best === 'write') {
      return 'code';
    }
    if (primaryDomain === 'writing' && best === 'general') {
      return 'write';
    }
    return best;
  }

  private resolveFormat(text: string): OutputFormat {
    const lower = text.toLowerCase();
    for (const signal of FORMAT_SIGNALS) {
      if (signal.regex.test(lower)) return signal.format;
      for (const kw of signal.keywords) {
        if (lower.includes(kw)) return signal.format;
      }
    }
    return 'auto';
  }

  private collectKeywords(text: string): string[] {
    const found: string[] = [];
    const lower = text.toLowerCase();
    for (const [, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
      for (const kw of keywords) {
        if (kw.includes(' ')) {
          if (lower.includes(kw)) found.push(kw);
        } else if (new RegExp(`\\b${this.escape(kw)}\\b`, 'i').test(lower)) {
          found.push(kw);
        }
      }
    }
    return [...new Set(found)].slice(0, 10);
  }

  private intentConfidence(text: string): number {
    const len = text.trim().length;
    if (len < 8) return 0.5;
    if (len < 30) return 0.7;
    return 0.85;
  }

  private needsSearch(text: string, primary: Domain, intent: Intent): boolean {
    if (intent === 'research') return true;
    if (primary === 'research') return true;
    if (SEARCH_SIGNALS.some(r => r.test(text))) return true;
    return false;
  }

  private needsReasoning(text: string, primary: Domain, intent: Intent): boolean {
    if (intent === 'analyze' || intent === 'compare') return true;
    if (COMPLEXITY_SIGNALS.some(r => r.test(text))) return true;
    if (primary === 'strategy' || primary === 'data') return true;
    return false;
  }

  private needsHumanize(text: string, intent: Intent): boolean {
    return intent === 'rewrite' || intent === 'write';
  }

  /* ─── enhancement ─── */

  /**
   * Produce an improved prompt: normalized grammar + an explicit format/length
   * directive. This is deterministic — it never changes the user's meaning and
   * never fabricates facts.
   */
  private enhance(
    text: string,
    format: OutputFormat,
    intent: Intent,
  ): string {
    let cleaned = text.trim();
    // Collapse multiple blank lines.
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    // Ensure leading sentence capitalization.
    cleaned = cleaned.replace(/^(.)/, m => m.toUpperCase());
    // Ensure a trailing period for statements to steer quality.
    if (cleaned && !/[.!?]$/.test(cleaned) && cleaned.length > 4) {
      cleaned += '.';
    }

    const directives: string[] = [];
    if (format !== 'auto') {
      directives.push(`Format the answer as ${this.formatName(format)}.`);
    } else if (intent === 'analyze') {
      directives.push('Give a clear, balanced analysis with trade-offs and a short conclusion.');
    } else if (intent === 'compare') {
      directives.push('Compare side-by-side with a summary of key differences and a recommendation.');
    } else if (intent === 'explain') {
      directives.push('Use plain language with concrete examples.');
    } else if (intent === 'summarize') {
      directives.push('Keep it concise and highlight the most important points.');
    }

    if (directives.length > 0) {
      return `${cleaned}\n\n${directives.join(' ')}`;
    }
    return cleaned;
  }

  private formatName(format: OutputFormat): string {
    if (format === 'json') return 'a JSON object';
    if (format === 'code') return 'a code block';
    if (format === 'table') return 'a table';
    if (format === 'list') return 'a list';
    if (format === 'email') return 'a professional email';
    if (format === 'report') return 'a structured report';
    if (format === 'essay') return 'an essay';
    if (format === 'checklist') return 'a checklist';
    if (format === 'summary') return 'a concise summary';
    return format;
  }

  private escape(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

export const promptAnalyzer = new PromptAnalyzer();