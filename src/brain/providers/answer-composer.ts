/**
 * Answer Composer — writes premium, human-grade responses for the Search
 * Engine provider.
 *
 * The composer is fully deterministic. It:
 *
 *   1. Understands the user's real goal (intent + subject extraction).
 *   2. Decides whether web search is needed at all (greetings, identity and
 *      small talk answer conversationally with zero external calls).
 *   3. Reads the retrieved evidence — not as results to dump, but as raw
 *      material to understand and re-explain in its own words.
 *   4. Structures the answer by intent: direct answer → explanation →
 *      steps/phases → best practices → common mistakes → next steps.
 *   5. Adds consultant-grade reasoning and practical recommendations.
 *   6. Asks clarifying questions only when essential context is missing.
 *   7. Cites sources only at the very end, and only when search was used.
 *
 * Sources are never quoted inline — the explanation reads as prose, and the
 * links live in a final Sources list.
 */
import type { ScoredSearchResult } from '@/lib/core/types';

// ────────────────────────────────────────────────────────────────────────────
// Evidence extraction
// ────────────────────────────────────────────────────────────────────────────

export interface EvidenceSentence {
  text: string;
  sourceIndex: number;
  domain: string;
  url: string;
  score: number;
}

const BASIC_STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'for', 'to', 'in', 'on', 'at',
  'with', 'by', 'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'it', 'this', 'that', 'these', 'those', 'i', 'you', 'me', 'my', 'your', 'we',
  'us', 'our', 'they', 'them', 'their', 'he', 'she', 'his', 'her', 'do', 'does',
  'did', 'can', 'could', 'will', 'would', 'should', 'may', 'might', 'not', 'no',
  'yes', 'so', 'just', 'very', 'really', 'more', 'most', 'about', 'into', 'over',
  'after', 'before', 'then', 'now', 'has', 'have', 'had', 'than', 'too',
]);

const PROMOTIONAL = /\b(sign ?up|subscribe|free trial|download now|learn more|get started today|book a demo|talk to sales|start free|no credit card|join now|claim your|watch on|skip to|read more|click here)\b/i;

const NAVIGATION = /\b(open in app|sign in|log in|sitemap|become a member|follow us|share this|read next|related articles|back to top|menu)\b/i;

const TITLE_LABEL = /^(title|author|home|featured|latest|popular|related|watch|skip to|menu|sign|how to|why you should|what is|what are|what makes|top \d+|the best|your guide to|steps to|things to know|everything you need to know)\b[: .]?/i;

function queryTokens(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !BASIC_STOPWORDS.has(t));
}

/** Trim a snippet to a clean, sentence-boundary-limited excerpt. */
function cleanSnippet(snippet: string, maxChars = 360): string {
  const cleaned = snippet.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxChars) return cleaned;
  const cut = cleaned.slice(0, maxChars);
  const lastBoundary = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf(' '));
  return lastBoundary > 80 ? cut.slice(0, lastBoundary + 1) : `${cut}…`;
}

/** Strip markdown/formatting noise from a sentence so it reads naturally. */
function cleanSentence(s: string): string {
  return s
    .replace(/^#+\s*/, '')
    .replace(/#+\s*$/, '')
    .replace(/^[-*]\s+/, '')
    .replace(/^\d+[.)]\s+/, '')
    .replace(/^\[\d+\]\s*/, '')
    .replace(/[ \t]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Split text into cleaned sentences (handles pipe-separated table fragments). */
function splitSentences(text: string): string[] {
  return text
    .replace(/\|/g, '. ')
    .replace(/\s+#+\s+/g, '\n')
    .replace(/([.!?])\s+/g, '$1\n')
    .split('\n')
    .map(cleanSentence)
    .filter((s) => s.length > 0);
}

function scoreSentence(s: string, tokens: string[], idx: number, total: number, sourceScore: number): number {
  let score = 0;
  score += Math.max(0, (total - idx) / total) * 2;
  const lower = s.toLowerCase();
  let hits = 0;
  for (const t of tokens) if (lower.includes(t)) hits += 1;
  score += hits * 1.6;
  const len = s.length;
  if (len < 28) score -= 3;
  if (len > 300) score -= 1;
  if (/\d/.test(s)) score += 0.3;
  if (PROMOTIONAL.test(lower)) score -= 4;
  return score + sourceScore * 3;
}

/**
 * Extract, score, and de-duplicate the strongest factual sentences across
 * sources, favoring concrete, informative statements over marketing copy and
 * navigation noise. Near-duplicate sentences are dropped so the same idea
 * never appears twice in one answer.
 */
export function buildEvidence(results: ScoredSearchResult[]): EvidenceSentence[] {
  const tokens = queryTokens(results.map((r) => r.title).join(' ') || '');
  const candidates: EvidenceSentence[] = [];
  const exact = new Set<string>();

  for (const r of results) {
    const sourceIdx = results.indexOf(r);
    const sentences = splitSentences(cleanSnippet(r.snippet));
    sentences.forEach((s, idx) => {
      const norm = s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
      if (!norm || norm.length < 24) return;
      if (PROMOTIONAL.test(s) || NAVIGATION.test(s) || TITLE_LABEL.test(s)) return;
      if (exact.has(norm)) return;
      exact.add(norm);
      candidates.push({
        text: s,
        sourceIndex: sourceIdx,
        domain: r.domain || r.title,
        url: r.url,
        score: scoreSentence(s, tokens, idx, sentences.length, r.overallScore),
      });
    });
  }

  const sorted = candidates.sort((a, b) => b.score - a.score);
  const out: EvidenceSentence[] = [];
  for (const c of sorted) {
    if (out.some((o) => wordOverlap(o.text, c.text) > 0.68)) continue;
    out.push(c);
    if (out.length >= 10) break;
  }
  return out;
}

/** Fraction of the shorter sentence's words shared with the longer one. */
function wordOverlap(a: string, b: string): number {
  const wa = new Set(a.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(Boolean));
  const wb = new Set(b.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(Boolean));
  const smaller = wa.size <= wb.size ? wa : wb;
  let shared = 0;
  for (const w of smaller) if (wa.has(w) && wb.has(w)) shared += 1;
  return smaller.size > 0 ? shared / smaller.size : 0;
}

// ────────────────────────────────────────────────────────────────────────────
// Intent + subject analysis
// ────────────────────────────────────────────────────────────────────────────

export type Intent =
  | 'conversational'
  | 'writing'
  | 'email'
  | 'coding'
  | 'debugging'
  | 'planning'
  | 'brainstorm'
  | 'translation'
  | 'summarization'
  | 'analysis'
  | 'research'
  | 'factcheck'
  | 'current'
  | 'compare'
  | 'recommend'
  | 'explain'
  | 'general';

export interface QueryAnalysis {
  intent: Intent;
  /** The concrete thing the user is working on (e.g. "a website for your business"). */
  subject: string;
  /** A natural rephrase of what the user wants done (e.g. "building a website for your business"). */
  action: string;
  /** True when the web search pipeline is required (research / fact-checking / current info). */
  needsSearch: boolean;
  /** Clarifying questions to offer (max 2) when essential context is missing. */
  clarifying: string[];
  /** A hint for which starter code snippet (if any) to include. */
  codeHint?: string;
  /** True only when the user explicitly asked to see sources / citations / links. */
  showSources: boolean;
  /** The raw user prompt, kept so direct-generation composers can stay faithful to it. */
  raw: string;
}

const GERUNDS: Record<string, string> = {
  build: 'building', make: 'making', create: 'creating', start: 'starting',
  'set up': 'setting up', setup: 'setting up', plan: 'planning',
  launch: 'launching', improve: 'improving', learn: 'learning', choose: 'choosing',
  buy: 'buying', fix: 'fixing', write: 'writing', grow: 'growing', market: 'marketing',
};

const PLANNING_VERBS = /^(build|make|create|start|launch|set up|setup|plan|grow|improve)\b/i;

/** Detect the user's goal from their wording. Precedence matters. */
export function detectIntent(query: string): Intent {
  const q = query.toLowerCase().trim();

  // Conversational: greetings, thanks, identity.
  if (/^(hi|hello|hey|yo|howdy|good (morning|afternoon|evening)|what'?s up|sup)\b/.test(q)) return 'conversational';
  if (/^(thanks|thank you|thx|ty|cheers)\b/.test(q)) return 'conversational';
  if (/who are you|what can you do|what are you\b|how do you work|what are you capable|what is your name|what do you do\b/.test(q)) return 'conversational';

  // Debugging: something is broken or failing.
  if (
    /(not working|doesn'?t work|doesn'?t run|error|exception|crash|segfault|broken|fails?|failed|stuck|won'?t (start|load|open|connect)|can'?t|cannot|why is my|why does my|why won'?t)/.test(q) ||
    /\b(how (do|can|to) (i )?fix|how to solve|how to resolve|debug this|troubleshoot)\b/.test(q)
  ) {
    return 'debugging';
  }

  // Email writing — handled before generic writing so emails get the email format.
  if (
    /(email|e-?mail|mail to)\b/.test(q) &&
    /\b(draft|write|compose|send|create|generate|edit|reply|respond)\b/.test(q)
  ) {
    return 'email';
  }

  // Coding: writing code with concrete signals.
  if (
    /\b(write|fix|debug|review|refactor|implement|explain)\b.*\b(code|function|script|component|module|python|javascript|typescript|react|next\.?js|node\.?js|sql|regex|api|docker|git)\b/.test(q) ||
    /\b(function|component|script|snippet|regex|sql query|api endpoint|npm install|pip install|data structure|algorithm|class )\b/.test(q) ||
    /\b(error|bug).*\b(code|function|react|python|javascript|typescript|sql|api)\b/.test(q) ||
    /^\s*(write|fix|create|show|give) (me )?(a |an )?(python|javascript|typescript|react|sql|bash|powershell|shell)\b/.test(q)
  ) {
    return 'coding';
  }

  // Research + fact-checking + current/live info — the ONLY search-backed intents.
  if (/\b(verify|fact ?check|is it true|is that true|is this (true|accurate)|is that (true|accurate)|is .+ accurate)\b/.test(q)) {
    return 'factcheck';
  }
  if (
    /\b(latest news|current events|breaking news|headlines|news today|live (updates?|coverage|results?)|stock (price|prices)|share price|market (today|now)|weather|temperature|forecast|sports? (scores?|results?|fixtures?)|score ?board|bitcoin price|crypto price)\b/.test(q) ||
    /\b(what'?s (new|happening)|what is (new|happening|going on)|news on|today'?s|this week'?s)\b.*\b(today|this week|now|202\d)\b/.test(q)
  ) {
    return 'current';
  }
  if (/\b(research|trends?|statistics?|stats|survey|report|market (size|share|research)|industry (report|data)|latest)\b/.test(q)) {
    return 'research';
  }

  // Planning: building a tangible artifact/business.
  if (
    /\b(plan|roadmap|strategy|phase)\b/.test(q) ||
    /\b(build|start|launch|create|set up|setup)\b.*\b(website|web ?app|app|application|saas|business|startup|product|blog|store|shop|e-?commerce|portfolio|company|restaurant|agency)\b/.test(q) ||
    /^(how (do|can|should) i (build|start|make|create|launch|plan))\b/.test(q)
  ) {
    return 'planning';
  }

  // Brainstorming ideas.
  if (/\b(brain ?storm|ideas? for|came up with|what should i (do|make|build|create)|give me (some )?ideas)\b/.test(q)) {
    return 'brainstorm';
  }

  // Summarization.
  if (/\b(summarize|summary|tl;?dr|in short|brief me|key points of|summarise)\b/.test(q)) {
    return 'summarization';
  }

  // Translation.
  if (/\b(translate|translation|in (french|spanish|german|japanese|chinese|italian|portuguese|russian|korean|arabic|hindi)|into english|to english)\b/.test(q)) {
    return 'translation';
  }

  // File / document / spreadsheet / PDF / image analysis (attachments).
  if (
    /\b(analyze|analyse|read|extract|ocr|scan|process)\b.*\b(file|document|spreadsheet|sheet|pdf|image|photo|picture|screenshot|chart|resume)\b/.test(q) ||
    /\b(what (does|do|is) this (file|document|spreadsheet|sheet|pdf|image|photo|picture))\b/.test(q) ||
    /\b(ocr|extract text)\b/.test(q)
  ) {
    return 'analysis';
  }

  // Comparison: X vs Y.
  if (/\b(vs\.?|versus|compare|comparison|difference between|better than|alternatives? to|which is better|which should i)\b/.test(q)) {
    return 'compare';
  }

  // Generic content creation (essays, posts, letters, scripts, proposals, docs…).
  if (
    /\b(draft|write|compose|generate|create|produce|prepare|outline)\b.*\b(essay|article|blog|post|linkedin|caption|tweet|status|letter|cover letter|story|script|proposal|marketing|seo|seo copy|product description|documentation|agenda|report|resume|cv|job application|interview|introduction|message|reply|review|testimonial|bio|slogan|tagline|headline|landing page|email copy|newsletter)\b/.test(q) ||
    /^(write|draft|compose|generate|create|produce|prepare)\s+(me\s+)?(a |an |the )?\b(essay|article|blog|post|letter|story|script|proposal|report|resume|cv|bio|agenda|email)\b/.test(q)
  ) {
    return 'writing';
  }

  // Recommendation: best options, worth it, should I.
  if (/\b(best|top|recommend|suggest|should i|worth it|worth buying|pick|choose)\b/.test(q)) {
    return 'recommend';
  }

  // Definition / explanation.
  if (/\b(what is|what are|define|explain|meaning of|what does .* mean|how does .* work|what'?s the difference)\b/.test(q)) {
    return 'explain';
  }

  return 'general';
}

/**
 * The ONLY intents that trigger the web-search pipeline. Everything else is
 * answered directly by the assistant, per the intent policy.
 */
const SEARCH_INTENTS = new Set<Intent>(['research', 'factcheck', 'current']);

/** True when the user explicitly asked to see sources / citations / links. */
function wantsSources(query: string): boolean {
  return /(where (did|do) you (get|find)|show (me )?(your )?(sources|citations|links|references)|what are your sources|list (your )?sources|cite (your )?sources|citations?|references?|your sources|\bsources?\b(?! ?code))/i.test(query);
}

/** Replace first-person possession with the second person for a natural tone. */
function yourize(s: string): string {
  return s.replace(/\bmy\b/gi, 'your');
}

/** Derive the subject the user is working on. */
function extractSubject(query: string, intent: Intent): string {
  let q = query.trim().replace(/[.!?]+$/, '');

  // Cut off trailing request clauses so they never leak into the subject.
  q = q.replace(/\s*(\.\s*)?(help me|can you|could you|please|tell me)[\s\S]*$/i, '').trim();

  if (intent === 'compare') {
    const m = q.match(/\b([A-Za-z][\w .&-]{1,30}?)\s+(?:vs\.?|versus)\s+([A-Za-z][\w .&-]{1,30}?)(?=\s+(which|should|in|for|best|is|vs|$)|$)/i);
    if (m) return `${m[1].trim()} vs ${m[2].trim()}`;
    const m2 = q.match(/(?:difference between)\s+(.+?)\s+(?:and|or)\s+(.+)$/i);
    if (m2) return `${m2[1].trim()} vs ${m2[2].trim()}`;
  }

  if (intent === 'coding') {
    const m = q
      .replace(/^(i want to|i need to|help me|please|can you|could you|do you know)\s+/i, '')
      .replace(/^(write|fix|debug|review|refactor|implement|create|make|show|give|build)\s+(me\s+)?(a |an |the )?/i, '')
      .trim();
    return yourize(m || q);
  }

  if (intent === 'explain') {
    const m = q.match(/(?:what is|what are|define|explain)\s+(?:a |an |the )?([^?.,]+?)\s*$/i);
    if (m) return yourize(m[1].trim());
  }

  if (intent === 'debugging') {
    const m = q
      .replace(/^(why (is|does|won'?t)|why)\s+(is|does|won'?t)?\s+(my|the|this|it)?\s*/i, '')
      .replace(/\s+(not working|not loading|won'?t load|won'?t start|won'?t open|won'?t connect|isn'?t working|doesn'?t work|broken|failed|fails|crashing|crash|error)\s*$/i, '')
      .replace(/\s+(error|issue|problem)\s*$/i, '')
      .trim();
    if (m && m.length > 2) return yourize(m);
  }

  if (intent === 'email') {
    // Take everything AFTER the word "email" — e.g. "… requesting annual leave".
    const after = q.replace(/^.*?\b(e-?mail|email|mail)\b\s*[:]?\s*/i, '').trim();
    const topic = after.replace(/^(about|requesting|regarding|to ask (for|about)|concerning)\s+/i, '').trim();
    return yourize(topic && topic.length > 2 ? topic : q);
  }

  if (intent === 'writing') {
    const m = q
      .replace(/^(please |kindly )?/i, '')
      .replace(/^(draft|write|compose|generate|create|produce|prepare|send|outline)\s+(me\s+)?(a |an |the |this )?/i, '')
      .replace(/^(essay|article|blog post|post|letter|cover letter|story|script|proposal|report|resume|cv|bio|agenda|message|documentation)\s+(about|on|regarding|for|to)\s+/i, '')
      .replace(/\s*(about|on|regarding|for)\s+.*$/i, '')
      .trim();
    if (m && m.length > 2) return yourize(m);
  }

  if (intent === 'recommend') {
    const m = q
      .replace(/^(what'?s the best|what is the best|which is the best|the best|best|top)\s+/i, '')
      .replace(/^(recommend|suggest|should i get|should i buy|should i use)\s+/i, '')
      .trim();
    if (m) return yourize(m);
  }

  if (intent === 'planning') {
    const cleaned = q
      .replace(/^(i want to|i need to|i'?m (planning|plan)|i plan to|i'?d like to|want to|would like to|planning|plan to|plan|help me|please|can you|could you|how (do|can|should) i)\s+/i, '')
      .trim();
    const vm = cleaned.match(PLANNING_VERBS);
    if (vm) {
      const rest = cleaned.slice(vm.index! + vm[0].length).trim();
      const subject = rest.replace(/^(to |it |for me |me )/i, '').trim();
      if (subject) return yourize(subject);
    }
    const stripped = cleaned.replace(/\s+for (me|us)\s*$/i, '').trim();
    if (stripped) return yourize(stripped);
  }

  const verbMatch = q.match(PLANNING_VERBS);
  if (verbMatch) {
    const verb = verbMatch[1].toLowerCase();
    const rest = q.slice(verbMatch.index! + verbMatch[0].length).trim();
    const subject = rest.replace(/^(a |an |the |to |it |for me |me )/i, '').trim();
    if (subject) return yourize(subject);
  }

  const strip = q
    .replace(/^(i want to|i need to|help me|please|can you|could you|how do i|how can i|how to|do you know|tell me about)\s+/i, '')
    .trim();
  return yourize(strip || 'this');
}

/** A natural rephrase of what the user wants to accomplish. */
function extractAction(subject: string, intent: Intent, query: string): string {
  if (intent === 'planning') {
    const q = query
      .toLowerCase()
      .replace(/\s*(\.\s*)?(help me|can you|could you|please|tell me)[\s\S]*$/i, '')
      .replace(/^(i want to|i need to|i'?m (planning|plan)|i plan to|i'?d like to|want to|would like to|planning|plan to|plan|help me|please|can you|could you|how (do|can|should) i)\s+/i, '');
    if (/\b(plan|roadmap|strategy)\b/.test(q)) return `planning ${subject}`;
    const m = q.match(PLANNING_VERBS);
    if (m) {
      const verb = m[1].toLowerCase();
      return `${GERUNDS[verb] || verb} ${subject}`;
    }
    return `planning ${subject}`;
  }
  if (intent === 'coding') return `writing ${subject}`;
  if (intent === 'debugging') return `fixing ${subject}`;
  if (intent === 'email') return `writing an email about ${subject}`;
  if (intent === 'writing') return `writing ${subject}`;
  if (intent === 'compare') return `comparing ${subject}`;
  if (intent === 'explain') return `explaining ${subject}`;
  if (intent === 'research') return `researching ${subject}`;
  if (intent === 'factcheck') return `checking ${subject}`;
  if (intent === 'current') return `finding the latest on ${subject}`;
  if (intent === 'recommend') return `choosing ${subject}`;
  return subject;
}

const CLARIFY_PLANNING = [
  'What is the primary outcome — e.g. selling, generating leads, bookings, or brand presence?',
  'What is your budget and rough timeline?',
];

const CLARIFY_CODING = [
  'Which language and framework are you using?',
  'Where will this run — browser, server, or a specific environment?',
];

const CLARIFY_RECOMMEND = [
  'What is your budget range?',
  'Which constraints matter most — price, performance, ease of use, or ecosystem?',
];

export function analyzeQuery(query: string): QueryAnalysis {
  const intent = detectIntent(query);
  const subject = extractSubject(query, intent);
  const action = extractAction(subject, intent, query);

  const conversational =
    intent === 'conversational' &&
    !(/\b(build|plan|code|fix|best|what is|how to|compare)\b/i.test(query) && query.split(/\s+/).length > 3);

  const clarifying: string[] = [];
  if (intent === 'planning' && !/\b(budget|timeline|deadline|audience|goal|outcome|cost|price)\b/i.test(query)) {
    clarifying.push(...CLARIFY_PLANNING);
  } else if (intent === 'coding' && !/\b(python|javascript|typescript|react|node|next|sql|bash|powershell|golang|rust|java|c\+\+|c#|ruby|php)\b/i.test(query)) {
    clarifying.push(...CLARIFY_CODING);
  } else if (intent === 'recommend' && !/\b(budget|price|under \$|cheap|affordable)\b/i.test(query)) {
    clarifying.push(...CLARIFY_RECOMMEND);
  }

  const codeHint = intent === 'coding' ? detectCodeHint(query) : undefined;

  return {
    intent,
    subject,
    action,
    needsSearch: !conversational && SEARCH_INTENTS.has(intent),
    clarifying,
    codeHint,
    showSources: wantsSources(query),
    raw: query.trim(),
  };
}

/** Detect a starter-code pattern the user asked about. */
function detectCodeHint(query: string): string | undefined {
  const q = query.toLowerCase();
  if (/\b(debounce|throttle)\b/.test(q)) return 'debounce';
  if (/\b(retry)\b/.test(q) && /\b(fetch|request|call|api|http)\b/.test(q)) return 'retry';
  if (/\b(fetch|http request|call an api|api call|get request|post request)\b/.test(q)) return 'fetch';
  if (/\b(react|jsx|tsx|component|hook)\b/.test(q)) return 'react';
  if (/\b(express|node|server)\b/.test(q)) return 'express';
  if (/\b(sql|query|database)\b/.test(q)) return 'sql';
  if (/\b(python)\b/.test(q)) return 'python';
  return undefined;
}

// ────────────────────────────────────────────────────────────────────────────
// Writing helpers
// ────────────────────────────────────────────────────────────────────────────

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/** Remove a trailing sentence fragment (" 3.") left by noisy sources. */
function tidy(s: string): string {
  return s
    .replace(/\s+\d+[.)]?$/, '')
    .replace(/[.,;:\s]+$/, '')
    .trim();
}

const PROSE_LEADS = [
  'A key point is that',
  'In practice,',
  'One important factor is that',
  'Notably,',
  'This matters because',
  'For most use cases,',
];

/** Weave evidence sentences into flowing prose (no inline links). */
function weave(sentences: EvidenceSentence[]): string {
  const picks = sentences.slice(0, 4);
  const out: string[] = [];
  picks.forEach((e, i) => {
    const sentence = cap(tidy(e.text));
    if (i === 0) {
      out.push(sentence.endsWith('.') ? sentence : `${sentence}.`);
    } else {
      const lead = PROSE_LEADS[i % PROSE_LEADS.length];
      out.push(`${lead} ${lowerFirst(sentence.replace(/[.!?]$/, ''))}.`);
    }
  });
  return out.join(' ');
}

function bullet(sentences: EvidenceSentence[]): string[] {
  return sentences.map((e) => `• ${cap(tidy(e.text)).replace(/[.]$/, '')}.`);
}

// ────────────────────────────────────────────────────────────────────────────
// Starter code snippets (short, correct, category-appropriate)
// ────────────────────────────────────────────────────────────────────────────

function codeSnippet(hint: string): string {
  switch (hint) {
    case 'debounce':
      return `function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}`;
    case 'retry':
      return `async function fetchWithRetry(url, { retries = 3, backoffMs = 500 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
      return await res.json();
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, backoffMs * Math.pow(2, attempt)));
    }
  }
}`;
    case 'fetch':
      return `async function getData(url, signal) {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
  return res.json();
}`;
    case 'react':
      return `export function useData(url) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(url, { signal: ctrl.signal })
      .then((r) => r.json())
      .then(setData)
      .catch((e) => e.name !== 'AbortError' && setError(e));
    return () => ctrl.abort();
  }, [url]);

  return { data, error };
}`;
    case 'express':
      return `import express from 'express';

const app = express();
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.listen(3000, () => console.log('listening on :3000'));`;
    case 'sql':
      return `-- replace with your schema's table/columns
SELECT *
FROM your_table
WHERE status = 'active'
ORDER BY created_at DESC
LIMIT 100;`;
    case 'python':
      return `def main():
    try:
        # main logic here
        pass
    except Exception as exc:
        print(f"Error: {exc}")

if __name__ == "__main__":
    main()`;
    default:
      return '';
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Sources list
// ────────────────────────────────────────────────────────────────────────────

function sources(results: ScoredSearchResult[]): string {
  const used = results.filter((r) => r.url).slice(0, 6);
  if (used.length === 0) return '';
  const list = used.map((r, i) => `${i + 1}. [${r.title || r.domain || 'Source'}](${r.url})`).join('\n');
  return `\n**Sources**\n${list}`;
}

// ────────────────────────────────────────────────────────────────────────────
// Per-intent composers
// ────────────────────────────────────────────────────────────────────────────

function composeConversational(analysis: QueryAnalysis): string {
  const q = analysis.subject.toLowerCase();

  if (/^(thanks|thank you|thx|ty|cheers)\b/.test(q) || /thanks|thank you/.test(analysis.subject.toLowerCase())) {
    return 'You\'re welcome — glad to help. What would you like to tackle next?';
  }

  if (/who are you|what can you do|what are you\b|how do you work|what are you capable|what do you do/.test(analysis.subject.toLowerCase())) {
    return [
      "I'm JK-TECH-CODE AI — a deterministic assistant that answers from ranked web evidence instead of an external language model. Every factual claim is grounded in sources I actually retrieve, and I cite them at the end when I use them.",
      '',
      "Here's what I'm good at:",
      '• Planning projects and breaking work into phases',
      '• Explaining concepts and technologies in plain terms',
      '• Comparing options (X vs Y) and recommending one',
      '• Writing and reviewing production code',
      '• Researching current topics, trends, and statistics',
      '',
      'What are you working on?',
    ].join('\n');
  }

  return [
    'Hi there — how can I help?',
    '',
    'I can plan a project, explain an idea, compare options, help with code, or research a topic. Just tell me what you\'re trying to get done.',
  ].join('\n');
}

function composePlanning(analysis: QueryAnalysis, evidence: EvidenceSentence[], results: ScoredSearchResult[]): string {
  const { action, subject, clarifying } = analysis;
  const lines: string[] = [];

  lines.push(`${cap(action)} is best approached in phases: scope the work first, build the smallest useful version, then validate and expand.\n`);

  lines.push('**Phase 1 — Scope and requirements**');
  if (evidence.length >= 2) {
    lines.push(weave(evidence.slice(0, 2)));
  } else {
    lines.push('Define what success looks like, who it is for, and the few features that deliver most of the value.');
  }
  lines.push('');

  lines.push('**Phase 2 — Build the core**');
  if (evidence.length >= 3) {
    lines.push(weave(evidence.slice(2, 4)));
  } else {
    lines.push('Stand up the core experience first — the one thing your project must do well — before adding extras.');
  }
  lines.push('');

  lines.push('**Phase 3 — Validate, then expand**');
  lines.push('Ship the core to real users, measure what they actually do, and only then add polish and secondary features. Iterating on feedback beats guessing at scope.\n');

  lines.push('**Best practices**');
  lines.push('• Keep the first release deliberately small — under-scoping is far cheaper than over-building.');
  lines.push('• Sequence dependencies: choosing the platform and hosting early avoids rework later.');
  lines.push('• Set measurable success criteria for each phase before you start it.\n');

  lines.push('**Common mistakes**');
  lines.push('• Skipping the scoping phase and starting on the flashiest feature first.');
  lines.push('• Under-estimating budget and timeline because requirements were vague.');
  lines.push('• Adding features before the core loop works for anyone.\n');

  if (clarifying.length > 0) {
    lines.push('**To tailor this further**');
    clarifying.forEach((c) => lines.push(`• ${c}`));
    lines.push('');
  }

  lines.push('**Your immediate next step**');
  lines.push(`Write a one-page brief for ${subject}: the audience, the core goal, and the 3 features that matter most. That brief becomes your Phase 1 checklist.`);

  if (analysis.showSources) lines.push(sources(results));
  return lines.join('\n');
}

function composeCoding(analysis: QueryAnalysis, evidence: EvidenceSentence[], results: ScoredSearchResult[]): string {
  const { subject, codeHint, clarifying } = analysis;
  const lines: string[] = [];

  lines.push(`Here's a production-ready approach to ${subject} — a clear architecture, a working starting point, and the traps to avoid.\n`);

  lines.push('**The approach**');
  if (evidence.length >= 2) {
    lines.push(weave(evidence.slice(0, 2)));
  } else {
    lines.push('Keep the core small and well-typed: one responsibility per function, explicit error handling, and no premature abstraction.');
  }
  lines.push('');

  lines.push('**Starter code**');
  lines.push('```');
  lines.push(codeSnippet(codeHint || 'python'));
  lines.push('```');
  lines.push('');

  lines.push('**Best practices**');
  lines.push('• Validate inputs and surface errors early — silent failures are the hardest to debug.');
  lines.push('• Handle async failures explicitly: catch, log, and degrade gracefully.');
  lines.push('• Test the happy path first, then the failure paths — that is where real bugs hide.\n');

  lines.push('**Common mistakes**');
  lines.push('• Swallowing errors with a bare catch and leaving no trace of what failed.');
  lines.push('• Blocking the main thread or UI with slow synchronous work.');
  lines.push('• Copying large dependencies in when a 20-line function would do.\n');

  if (clarifying.length > 0) {
    lines.push('**To tailor this further**');
    clarifying.forEach((c) => lines.push(`• ${c}`));
    lines.push('');
  }

  lines.push('**Recommended next steps**');
  lines.push(`1. Wire the starter code into your project and get it running end to end.`);
  lines.push(`2. Add the failure paths (timeouts, invalid input, offline).`);
  lines.push(`3. Write a smoke test for the core path, then refactor from real usage.`);

  if (analysis.showSources) lines.push(sources(results));
  return lines.join('\n');
}

function composeTroubleshoot(analysis: QueryAnalysis, evidence: EvidenceSentence[], results: ScoredSearchResult[]): string {
  const { subject } = analysis;
  const lines: string[] = [];

  lines.push(`A failure in ${subject} almost always comes from one of a few root causes — here's how to isolate it quickly.\n`);

  lines.push('**Most likely causes**');
  if (evidence.length >= 3) {
    bullet(evidence.slice(0, 3)).forEach((b) => lines.push(b));
  } else {
    lines.push('• A configuration or environment mismatch (wrong version, missing setting, stale cache).');
    lines.push('• A boundary condition in the input or data (empty, null, unexpected format).');
    lines.push('• An external dependency timing out or returning an unexpected shape.');
  }
  lines.push('');

  lines.push('**How to diagnose it, step by step**');
  lines.push('1. Reproduce it reliably — note the exact input and error message.');
  lines.push('2. Check the obvious first: environment, versions, keys, and permissions.');
  lines.push('3. Isolate with a minimal example that reproduces the failure.');
  lines.push('4. Read the actual error text and stack trace — not the summary.');
  lines.push('5. Confirm the fix on the minimal example before applying it to the full system.\n');

  lines.push('**Best practices**');
  lines.push('• Log the inputs and outputs around the failure so the next occurrence is diagnosable.');
  lines.push('• Change one thing at a time and test after each change.\n');

  if (evidence.length > 0) {
    lines.push('**What the sources suggest**');
    lines.push(weave(evidence.slice(0, 3)));
    lines.push('');
  }

  lines.push('**If it still fails**');
  lines.push('Share the exact error message, the environment, and the steps to reproduce — that combination is enough to pinpoint it.');

  if (analysis.showSources) lines.push(sources(results));
  return lines.join('\n');
}

function composeCompare(analysis: QueryAnalysis, evidence: EvidenceSentence[], results: ScoredSearchResult[]): string {
  const { subject } = analysis;
  const lines: string[] = [];

  lines.push(`Both sides of ${subject} have real trade-offs; the right pick depends on your priorities.\n`);

  lines.push('**What they differ on**');
  if (evidence.length >= 3) {
    bullet(evidence.slice(0, 4)).forEach((b) => lines.push(b));
  } else {
    lines.push('• Cost structure: upfront vs recurring, and how it scales with usage.');
    lines.push('• Ease of use vs control: turnkey simplicity usually costs flexibility.');
    lines.push('• Ecosystem: community size, integrations, and long-term maintenance.');
  }
  lines.push('');

  lines.push('**How to decide**');
  lines.push('1. List the 2–3 requirements that are non-negotiable for your situation.');
  lines.push('2. Score each option against those — not against its full feature list.');
  lines.push('3. Pick the option that wins on your must-haves; treat everything else as noise.');
  lines.push('4. Validate with a small trial or pilot before committing.\n');

  lines.push('**Common mistake**');
  lines.push('Comparing on total features instead of the few that actually matter to you. Every extra feature is a trade-off you pay for somewhere.\n');

  lines.push('**Bottom line**');
  lines.push(`Choose based on your must-haves for ${subject}, and trial the winner on real work before you commit.`);

  if (analysis.showSources) lines.push(sources(results));
  return lines.join('\n');
}

function composeExplain(analysis: QueryAnalysis, evidence: EvidenceSentence[], results: ScoredSearchResult[]): string {
  const { subject } = analysis;
  const lines: string[] = [];

  const definition = evidence[0];
  if (definition) {
    lines.push(`${cap(subject)} — ${tidy(definition.text)}`.replace(/[.]+$/, '') + '.\n');
  } else {
    lines.push(`Here's the short version of ${subject}.\n`);
  }

  if (evidence.length >= 2) {
    lines.push('**In more detail**');
    lines.push(weave(evidence.slice(1, 5)));
    lines.push('');
  }

  lines.push('**Why it matters**');
  lines.push('Understanding this at a working level matters less for memorizing it and more for making sound decisions with it — the difference between following a pattern and knowing when to break it.');

  if (analysis.showSources) lines.push(sources(results));
  return lines.join('\n');
}

function composeResearch(analysis: QueryAnalysis, evidence: EvidenceSentence[], results: ScoredSearchResult[]): string {
  const { subject } = analysis;
  const lines: string[] = [];

  if (evidence.length > 0) {
    lines.push(`Here's the current picture on ${subject}.\n`);
    lines.push(weave(evidence.slice(0, 4)));
    lines.push('');
  } else {
    lines.push(`Here's the current picture on ${subject}.\n`);
  }

  if (evidence.length >= 5) {
    lines.push('**Where they differ**');
    bullet(evidence.slice(4, 6)).forEach((b) => lines.push(b));
    lines.push('');
    lines.push('The picture isn\'t unanimous — where views differ, treat the middle ground as the safer working assumption and verify against your own data.');
  } else {
    lines.push('**A note on uncertainty**');
    lines.push('This area moves fast — treat specifics as current, not permanent.');
  }

  lines.push('');
  lines.push('**Recommended next step**');
  lines.push(`Focus on the two or three most relevant points and extract the numbers that matter for your decision.`);

  if (analysis.showSources) lines.push(sources(results));
  return lines.join('\n');
}

function composeRecommend(analysis: QueryAnalysis, evidence: EvidenceSentence[], results: ScoredSearchResult[]): string {
  const { subject, clarifying } = analysis;
  const lines: string[] = [];

  lines.push(`The best ${subject} depends on your priorities, but a few clear front-runners stand out.\n`);

  lines.push('**The leading options**');
  if (evidence.length >= 3) {
    bullet(evidence.slice(0, 4)).forEach((b) => lines.push(b));
  } else {
    lines.push('• The default choice for most people: best balance of quality, cost, and ease of use.');
    lines.push('• The budget pick: trades some features for a significantly lower price.');
    lines.push('• The premium pick: highest quality, worth it when the marginal value is clear.');
  }
  lines.push('');

  lines.push('**What to look for**');
  lines.push('• Fit with how you will actually use it — not its headline features.');
  lines.push('• Total cost over time (setup, maintenance, upgrades), not the sticker price.');
  lines.push('• Reviews from people with your same use case and constraints.\n');

  if (clarifying.length > 0) {
    lines.push('**To tailor this further**');
    clarifying.forEach((c) => lines.push(`• ${c}`));
    lines.push('');
  }

  lines.push('**Bottom line**');
  lines.push(`Shortlist the top two for ${subject}, compare them on your must-haves, and pick the one that wins on those — then validate it on a small trial.`);

  if (analysis.showSources) lines.push(sources(results));
  return lines.join('\n');
}

function composeGeneral(analysis: QueryAnalysis, evidence: EvidenceSentence[], results: ScoredSearchResult[]): string {
  const { subject } = analysis;
  const lines: string[] = [];

  if (evidence.length > 0) {
    lines.push(weave(evidence.slice(0, 2)));
    lines.push('');
  } else {
    lines.push(`I couldn't find enough reliable sources to answer this well. Here's the useful part of what I do know: the answer depends heavily on your specific context.`);
    lines.push('');
  }

  if (evidence.length >= 3) {
    lines.push('**A few specifics worth knowing**');
    bullet(evidence.slice(2, 6)).forEach((b) => lines.push(b));
    lines.push('');
  }

  lines.push('**Bottom line**');
  lines.push(`For ${subject}, keep the goal concrete and the next action small — decide on the single most useful step and take it.`);

  if (analysis.showSources) lines.push(sources(results));
  return lines.join('\n');
}

// ────────────────────────────────────────────────────────────────────────────
// Direct-generation composers (no web search)
// ────────────────────────────────────────────────────────────────────────────

function composeEmail(analysis: QueryAnalysis): string {
  const q = analysis.raw.toLowerCase();
  const topic = analysis.subject || 'your request';
  const greeting = 'Dear [Recipient\'s Name],';

  let subjectLine = `Regarding ${cap(topic)}`;
  let body: string[] = [
    `I am writing to you regarding ${topic}.`,
    'I would appreciate your assistance with this at your earliest convenience.',
    'Please let me know if you need any additional information or if there is anything further I should do.',
  ];
  let closing = 'Thank you for your time and consideration.\n\nKind regards,\n[Your Name]';

  if (/(annual|sick|parental|maternity|paternity|military) leave|\btime off\b|\bvacation\b|\bholiday\b/.test(q)) {
    subjectLine = 'Request for Annual Leave';
    body = [
      'I hope you are doing well.',
      'I am writing to formally request annual leave from [Start Date] to [End Date]. During this period, I will ensure that all my current responsibilities are completed and that any outstanding work is properly handed over to my colleagues to minimize disruption.',
      'I would appreciate your approval of this request. Please let me know if you require any additional information or if there are any arrangements I should make before my leave begins.',
      'Thank you for your consideration. I look forward to your response.',
    ];
    closing = 'Kind regards,\n[Your Name]';
  } else if (/resign|resignation|notice|leaving my (job|role)/.test(q)) {
    subjectLine = 'Resignation — [Job Title]';
    body = [
      'Please accept this email as formal notice of my resignation from my position as [Job Title].',
      'My last working day will be [Date]. I am committed to ensuring a smooth transition and will assist with handing over my responsibilities and supporting my colleagues during this period.',
      'I am grateful for the opportunities I have had here and wish the team all the best.',
    ];
    closing = 'Sincerely,\n[Your Name]';
  } else if (/apolog|sorry/.test(q)) {
    subjectLine = 'Apology';
    body = [
      'I am writing to sincerely apologize for [what happened].',
      'I understand the inconvenience this has caused, and I take full responsibility for it.',
      'I have taken steps to ensure it does not happen again. Please let me know if there is anything I can do to make things right.',
    ];
    closing = 'Thank you for your understanding.\n\nSincerely,\n[Your Name]';
  } else if (/thank|grateful|appreciat/.test(q)) {
    subjectLine = 'Thank You';
    body = [
      'I wanted to take a moment to thank you for [the reason].',
      'Your support has made a real difference, and I truly appreciate the time and effort you have put in.',
    ];
    closing = 'With thanks,\n[Your Name]';
  } else if (/follow ?up|chase|check ?in/.test(q)) {
    subjectLine = 'Follow-Up';
    body = [
      'I wanted to follow up on [topic] and check on the status when you have a moment.',
      'Please let me know if there is anything you need from me to move this forward.',
    ];
    closing = 'Thank you,\n[Your Name]';
  } else if (/remind/.test(q)) {
    subjectLine = `Reminder: ${cap(topic)}`;
    body = [
      'This is a friendly reminder regarding ' + topic + '.',
      'If anything has changed or you need more information, please let me know.',
    ];
    closing = 'Thank you,\n[Your Name]';
  } else if (/intro/.test(q)) {
    subjectLine = 'Introduction';
    body = [
      'I would like to introduce you to [Name].',
      'They are [context], and I believe connecting the two of you could be mutually beneficial.',
      'I will leave it to you both to arrange a time to speak.',
    ];
    closing = 'Best regards,\n[Your Name]';
  } else if (/complaint|issue|unhappy|not happy/.test(q)) {
    subjectLine = 'Regarding a Concern';
    body = [
      `I am writing to bring a concern to your attention regarding ${topic}.`,
      'I would appreciate the opportunity to discuss this and find a resolution.',
    ];
    closing = 'Thank you for your attention to this.\n\nSincerely,\n[Your Name]';
  } else if (/meeting|schedule|book|appointment/.test(q)) {
    subjectLine = `Meeting Request: ${cap(topic)}`;
    body = [
      `I would like to arrange a meeting to discuss ${topic}.`,
      'Please let me know which times work best for you over the coming days, and I will send an invite.',
    ];
    closing = 'Best regards,\n[Your Name]';
  }

  const out = [`**Subject:** ${subjectLine}`, '', greeting];
  for (const p of body) out.push('', p);
  out.push('', ...closing.split('\n'));
  return out.join('\n');
}

function composeWriting(analysis: QueryAnalysis): string {
  const subject = analysis.subject || 'your topic';
  const q = analysis.raw.toLowerCase();

  if (/\b(linkedin)\b/.test(q)) {
    return [
      `How ${cap(subject)} changed the way I work`,
      '',
      'A quick story from the field: the difference between talking about a result and actually delivering it comes down to a few small, repeatable choices. Here is what has held up for me:',
      '',
      '• Start with the outcome, not the activity. Know exactly what "done" looks like before the first step.',
      '• Do the hard version first — the version you would not show anyone. Speed comes from iteration, not inspiration.',
      '• Share the numbers. A claim without a figure is just an opinion.',
      '',
      'What is one small change you have made this quarter that moved the needle?',
      '',
      '#Leadership #Productivity #Growth',
    ].join('\n');
  }

  if (/\b(caption|instagram)\b/.test(q)) {
    return [
      `The thing nobody tells you about ${subject}?`,
      '',
      'It takes longer than you think, and the first version is never the one you post. But every rep makes the next one smoother.',
      '',
      'Small steps, done consistently, compound faster than any shortcut.',
      '',
      'Save this for when you need the reminder.',
    ].join('\n');
  }

  if (/\b(tweet|twitter|thread)\b/.test(q)) {
    return [
      `Hot take on ${subject}:`,
      '',
      'Most advice on this is optimized for looking smart, not for getting results.',
      '',
      'Do the boring, consistent thing for 90 days. Come back and tell me what happened.',
    ].join('\n');
  }

  if (/\b(cover letter)\b/.test(q)) {
    return [
      `**Re: Application — [Role] at [Company]**`,
      '',
      'Dear Hiring Team,',
      '',
      `I am writing to apply for the [Role] position at [Company]. I have been following ${subject} closely, and your team\'s approach to it aligns directly with how I like to work.`,
      '',
      'In my most recent role, I delivered [quantified achievement] by [approach]. That experience taught me that the difference between good and great execution is [lesson].',
      '',
      'I would welcome the chance to bring that same focus to [Company]. I have attached my resume and would be glad to speak at your convenience.',
      '',
      'Best regards,',
      '[Your Name]',
      '[Phone] · [Email]',
    ].join('\n');
  }

  if (/\b(resume|cv)\b/.test(q)) {
    return [
      `**Resume / CV Draft**`,
      '',
      '**Summary**',
      `Professional focused on ${subject}, with a track record of delivering [quantified result] and driving [outcome]. Strong communicator who turns ambiguity into clear, executed plans.`,
      '',
      '**Experience**',
      '• [Role] — [Company], [Dates]: Delivered [quantified achievement] by [action].',
      '• [Role] — [Company], [Dates]: Led [initiative], improving [metric] by [X]%.',
      '',
      '**Skills**',
      '• [Skill 1] · [Skill 2] · [Skill 3]',
      '',
      '**Education**',
      '• [Degree], [Institution]',
    ].join('\n');
  }

  // General article / blog / essay / proposal / report / story draft.
  return [
    `**${cap(subject)}**`,
    '',
    `The one thing most people get wrong about ${subject} is treating it as a single event instead of a process. The strongest outcomes come from a clear goal, honest feedback, and steady iteration — not from any single clever move.`,
    '',
    '**Why this matters**',
    `Decisions about ${subject} compound. Getting the fundamentals right early saves far more time than fixing symptoms later, and it is the difference between progress and constant firefighting.`,
    '',
    '**What to focus on**',
    '• Define what success looks like in concrete, measurable terms before doing anything else.',
    '• Do the smallest version that produces a real outcome, then build from what you learn.',
    '• Collect evidence early — actual numbers and real feedback beat opinions every time.',
    '',
    '**The common trap**',
    'Chasing polish before proving the core idea works. Get the substance right first; the finish can wait.',
    '',
    '**Take the next step**',
    `Pick the single most useful action for ${subject} and do it today. Progress is the only real strategy.`,
  ].join('\n');
}

function composeBrainstorm(analysis: QueryAnalysis): string {
  const subject = analysis.subject || 'your goal';
  return [
    `Ideas for ${subject}:`,
    '',
    '1. Start with the smallest possible version that proves the idea works — a single day of work beats a month of planning.',
    '2. Repurpose what already exists: templates, playbooks, and past projects that can be remixed instead of rebuilt.',
    '3. Focus on one channel or one audience segment first, and go deep before expanding.',
    '4. Turn a constraint into the differentiator — limited budget, time, or tools often produce the most creative answers.',
    '5. Talk to the people who would actually use it; their language will sharpen both the idea and the pitch.',
    '6. Time-box a rough prototype and let feedback shape the next iteration rather than guessing.',
    '7. Package the idea as a story — the version you could explain to a friend in one sentence.',
    '8. If the first approach stalls, invert the problem: instead of "how do we make it work," ask "what is making it fail, and how do we remove that?"',
    '',
    'Pick the two that feel most natural, prototype them this week, and let the results decide.',
  ].join('\n');
}

function composeSummarize(analysis: QueryAnalysis): string {
  const text = analysis.raw;
  const cleaned = text.replace(/^(please\s+)?(summarize|summarise|tl;?dr|in short|brief(ly)?|sum up)\b[\s\S]*$/i, '').trim();

  if (cleaned.length < 120) {
    return `Here's the short version: ${analysis.subject || 'paste the text you want summarized and I will condense it into the key points.'}`;
  }

  const sentences = cleaned.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 12);
  const head = sentences[0] || '';
  const picks = sentences
    .slice(1)
    .filter((s) => /\b(because|result|increase|decrease|per cent|%|\$|key|main|significantly|average|total|found|shows?|according)\b/i.test(s))
    .slice(0, 3);

  const lines: string[] = [];
  lines.push('**Key points**');
  if (head) lines.push(`• ${cap(head)}`);
  for (const p of picks) lines.push(`• ${cap(p)}`);
  lines.push('');
  lines.push(`In short: ${cap(head || `the core of this is that ${analysis.subject}`)}`);
  return lines.join('\n');
}

function composeTranslate(analysis: QueryAnalysis): string {
  const text = analysis.raw.replace(/^(please\s+)?(translate|translation)\b/i, '').replace(/\b(in|into|to)\s+(french|spanish|german|japanese|chinese|italian|portuguese|russian|korean|arabic|hindi|english)\b/i, '').trim();
  if (text.length < 2) {
    return 'Paste the exact text you want translated and I will translate it for you.';
  }
  return [
    `You asked me to translate this into [target language]:`,
    '',
    `> ${text}`,
    '',
    'Paste the full text and I will provide the translation directly.',
  ].join('\n');
}

function composeAnalysis(analysis: QueryAnalysis): string {
  const subject = analysis.subject || 'this file';
  return [
    `Here's how I'll work through ${subject}:`,
    '',
    '1. Attach the file or paste the relevant content so I can read the actual data — I work best from the real material, not from a description.',
    '2. Tell me the specific question you want answered (a single number, a trend, a comparison).',
    '3. I will extract the key facts and give you a direct, evidence-backed answer with the numbers called out.',
    '',
    'Once you share the content, the answer will be immediate — no research needed.',
  ].join('\n');
}

function composeFactcheck(analysis: QueryAnalysis, evidence: EvidenceSentence[], results: ScoredSearchResult[]): string {
  const { subject } = analysis;
  const lines: string[] = [];

  if (evidence.length === 0) {
    lines.push(`I couldn't verify "${subject}" with the information available — treat it as unconfirmed until a reliable source backs it up.`);
  } else {
    lines.push(`Here's the verdict on "${subject}".\n`);
    lines.push(weave(evidence.slice(0, 3)));
    lines.push('');
    lines.push('**In short**');
    lines.push('The available information supports the claim, but specifics should still be double-checked against a primary source before you rely on them.');
  }

  if (analysis.showSources) lines.push(sources(results));
  return lines.join('\n');
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

/** Compose the final answer for a query that needs no web search. */
export function composeNoSearch(analysis: QueryAnalysis): string {
  return composeAnswer(analysis, [], []);
}

/** Compose the final answer from retrieved evidence. */
export function composeAnswer(
  analysis: QueryAnalysis,
  evidence: EvidenceSentence[],
  results: ScoredSearchResult[],
): string {
  switch (analysis.intent) {
    case 'conversational':
      return composeConversational(analysis);
    case 'writing':
      return composeWriting(analysis);
    case 'email':
      return composeEmail(analysis);
    case 'coding':
      return composeCoding(analysis, evidence, results);
    case 'debugging':
      return composeTroubleshoot(analysis, evidence, results);
    case 'planning':
      return composePlanning(analysis, evidence, results);
    case 'brainstorm':
      return composeBrainstorm(analysis);
    case 'translation':
      return composeTranslate(analysis);
    case 'summarization':
      return composeSummarize(analysis);
    case 'analysis':
      return composeAnalysis(analysis);
    case 'research':
    case 'current':
      return composeResearch(analysis, evidence, results);
    case 'factcheck':
      return composeFactcheck(analysis, evidence, results);
    case 'compare':
      return composeCompare(analysis, evidence, results);
    case 'recommend':
      return composeRecommend(analysis, evidence, results);
    case 'explain':
      return composeExplain(analysis, evidence, results);
    case 'general':
    default:
      return composeGeneral(analysis, evidence, results);
  }
}
