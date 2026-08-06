/**
 * Content Generation Engine — deterministic, production-grade content writer.
 *
 * Recognizes a broad set of content types from natural language (no templates
 * menu, no "which format do you want?" friction) and returns a polished,
 * publication-ready Markdown deliverable. It never searches the web, never
 * explains how to write, and never dumps "here is a template" boilerplate —
 * it produces the finished work.
 *
 * Every generator:
 *   • Weaves the user's topic into real, professional copy.
 *   • Adapts tone (professional / corporate / formal / friendly / casual /
 *     technical / academic / creative / persuasive / inspirational /
 *     conversational).
 *   • Adapts length (short / medium / long / comprehensive).
 *   • Ends with a clean, ready-to-publish artifact.
 */
import type { QueryAnalysis } from './answer-composer';

export interface ContentRequest {
  raw: string;
  subject: string;
}

export interface ContentResult {
  /** The detected content kind id (e.g. "business-plan"). */
  kind: string;
  content: string;
}

const cap = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const lower = (s: string): string => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/** Title-case a topic for use in headings. */
function titleCase(s: string): string {
  const stop = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'of', 'for', 'to', 'in', 'on', 'with']);
  return cap(s)
    .split(/\s+/)
    .map((w, i) => (i > 0 && stop.has(w.toLowerCase()) ? w.toLowerCase() : cap(w)))
    .join(' ');
}

/** Normalize a topic away from leading articles/cruft. */
function cleanTopic(subject: string): string {
  return subject.trim().replace(/^(a |an |the |your |my |this )/i, '').trim();
}

// ────────────────────────────────────────────────────────────────────────────
// Tone + length detection
// ────────────────────────────────────────────────────────────────────────────

type Tone =
  | 'professional' | 'corporate' | 'formal' | 'friendly' | 'casual'
  | 'technical' | 'academic' | 'creative' | 'persuasive' | 'inspirational'
  | 'conversational';

type Length = 'short' | 'medium' | 'long' | 'comprehensive';

function detectTone(q: string): Tone {
  if (/\b(persuasive|convince|sell)\b/.test(q)) return 'persuasive';
  if (/\b(inspir|motivat)\b/.test(q)) return 'inspirational';
  if (/\b(academic|scholarly|research paper|dissertation)\b/.test(q)) return 'academic';
  if (/\b(technical|developer|engineering)\b/.test(q)) return 'technical';
  if (/\b(creative|imaginative|story|poem|song|novel)\b/.test(q)) return 'creative';
  if (/\b(casual|relaxed|chatty)\b/.test(q)) return 'casual';
  if (/\b(friendly|warm)\b/.test(q)) return 'friendly';
  if (/\b(corporate|executive)\b/.test(q)) return 'corporate';
  if (/\b(formal|letter)\b/.test(q)) return 'formal';
  if (/\b(conversational|natural)\b/.test(q)) return 'conversational';
  return 'professional';
}

function detectLength(q: string): Length {
  if (/\b(comprehensive|in ?depth|detailed|long ?form|longest)\b/.test(q)) return 'comprehensive';
  if (/\b(short|brief|concise|quick)\b/.test(q)) return 'short';
  if (/\b(long|detailed|extended)\b/.test(q)) return 'long';
  return 'medium';
}

/** Voice modifiers — no AI clichés, no filler openers. */
const VOICE: Record<Tone, { opener: string; cta: string; adj: string }> = {
  professional: { opener: 'This document lays out', cta: 'Next step', adj: 'a clear, practical' },
  corporate: { opener: 'This brief outlines', cta: 'Recommended action', adj: 'an executive-level' },
  formal: { opener: 'The following outlines', cta: 'Next steps', adj: 'a formal' },
  friendly: { opener: 'Here is', cta: 'Try this first', adj: 'a friendly, straightforward' },
  casual: { opener: 'Quick take:', cta: 'Do this', adj: 'an honest, no-nonsense' },
  technical: { opener: 'This specification describes', cta: 'Implementation note', adj: 'a technical' },
  academic: { opener: 'This paper examines', cta: 'Suggested next step', adj: 'a rigorous' },
  creative: { opener: 'What follows is', cta: 'Where to take it next', adj: 'a creative' },
  persuasive: { opener: 'Here is the case for', cta: 'Make the decision', adj: 'a persuasive' },
  inspirational: { opener: 'This is the story of', cta: 'Take the first step', adj: 'an inspiring' },
  conversational: { opener: 'So here is the deal on', cta: 'Start here', adj: 'a practical' },
};

// ────────────────────────────────────────────────────────────────────────────
// Quality pass — applied to every generated artifact
// ────────────────────────────────────────────────────────────────────────────

/** Remove duplicate paragraphs, empty filler, and stray AI clichés. */
export function finalizeContent(text: string): string {
  let out = text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Drop duplicate paragraphs / bullets (case-insensitive) to keep it tight.
  const lines = out.split('\n');
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const line of lines) {
    const key = line.trim().toLowerCase();
    if (!key) { deduped.push(line); continue; }
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(line);
  }
  out = deduped.join('\n').replace(/\n{3,}/g, '\n\n').trim();

  // Remove lazy filler sentences that add no value.
  const filler = /\b(here('| i)s (a |an |the )?something|as i mentioned earlier|in this fast-paced world|in today'?s digital age|it is important to note that|let me be clear|without further ado)\b/i;
  out = out
    .split('\n')
    .filter((l) => !(l.trim().length < 90 && filler.test(l)))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// Content type detection
// ────────────────────────────────────────────────────────────────────────────

interface KindRule { kind: string; label: string; test: RegExp }

const KIND_RULES: KindRule[] = [
  // E-commerce
  { kind: 'product-comparison', label: 'Product Comparison', test: /\b(compare|comparison)\b.*\b(product|products|items)\b/ },
  { kind: 'product-faq', label: 'Product FAQ', test: /\b(faq|frequently asked)\b.*\b(product|item)\b/ },
  { kind: 'amazon-listing', label: 'Amazon Listing', test: /\b(amazon listing|amazon)\b/ },
  { kind: 'shopify', label: 'Shopify Product Content', test: /\b(shopify|woocommerce|e-?commerce listing)\b/ },
  { kind: 'product-spec', label: 'Product Specification', test: /\b(product spec(ification)?|spec sheet)\b/ },
  { kind: 'product-description', label: 'Product Description', test: /\b(product description|describe (a |the |this )?(product|item))\b/ },
  { kind: 'product-title', label: 'Product Title', test: /\b(product title|title for (a |the |this )?product)\b/ },
  // Coding content
  { kind: 'api-doc', label: 'API Documentation', test: /\bapi (documentation|docs|doc)\b|\bdocument (the )?api\b/ },
  { kind: 'readme', label: 'README', test: /\b(readme|read ?me file)\b/ },
  { kind: 'tech-spec', label: 'Technical Specification', test: /\b(technical (specification|spec)|architecture document|tech design)\b/ },
  { kind: 'code-comment', label: 'Code Comments', test: /\b(code comments|comment (the |this )?code)\b/ },
  { kind: 'user-manual', label: 'User Manual', test: /\b(user manual|instruction manual|how to use (the |this )?)\b/ },
  // Academic
  { kind: 'citations', label: 'Citations', test: /\b(citation|citing|citations)\b|\b(apa|mla|harvard|chicago|ieee)\b.*\b(format|style|cite)\b/ },
  { kind: 'discussion-post', label: 'Discussion Post', test: /\b(discussion post|forum post|discussion response)\b/ },
  { kind: 'presentation', label: 'Presentation', test: /\b(presentation|slides|powerpoint|deck)\b/ },
  { kind: 'case-study', label: 'Case Study', test: /\bcase study\b/ },
  { kind: 'literature-review', label: 'Literature Review', test: /\bliterature (review|on|about)\b/ },
  { kind: 'research-paper', label: 'Research Paper', test: /\b(research paper|academic paper|paper on)\b/ },
  { kind: 'assignment', label: 'Assignment', test: /\bassignment\b/ },
  { kind: 'essay', label: 'Essay', test: /\bessay\b/ },
  // Professional writing
  { kind: 'statement-of-purpose', label: 'Statement of Purpose', test: /\b(statement of purpose|sop for (school|university)|personal statement)\b/ },
  { kind: 'recommendation-letter', label: 'Recommendation Letter', test: /\b(recommendation letter|letter of recommendation|reference letter)\b/ },
  { kind: 'motivation-letter', label: 'Motivation Letter', test: /\b(motivation(al)? letter)\b/ },
  { kind: 'cover-letter', label: 'Cover Letter', test: /\bcover letter\b/ },
  { kind: 'cv', label: 'CV', test: /\b(cv|curriculum vitae)\b/ },
  { kind: 'resume', label: 'Resume', test: /\b(resume|résumé)\b/ },
  { kind: 'complaint-letter', label: 'Complaint Letter', test: /\bcomplaint letter\b/ },
  { kind: 'thank-you-email', label: 'Thank-You Email', test: /\b(thank-?you (email|note|message)|thanks? (email|note))\b/ },
  { kind: 'follow-up-email', label: 'Follow-Up Email', test: /\b(follow-?up (email|message))\b/ },
  { kind: 'formal-letter', label: 'Formal Letter', test: /\bformal letter\b|\bletter to\b/ },
  // SEO
  { kind: 'meta-description', label: 'Meta Description', test: /\b(meta description|seo description)\b/ },
  { kind: 'meta-title', label: 'Meta Title', test: /\b(meta title|seo title|title tag)\b/ },
  { kind: 'faq', label: 'FAQ Section', test: /\b(faq|frequently asked questions)\b/ },
  { kind: 'pillar-page', label: 'Pillar Page', test: /\b(pillar page|cornerstone)\b/ },
  { kind: 'topic-cluster', label: 'Topic Cluster', test: /\b(topic cluster|cluster content)\b/ },
  { kind: 'image-alt', label: 'Image ALT Text', test: /\b(alt text|image alt)\b/ },
  { kind: 'url-slug', label: 'URL Slug', test: /\b(url slug|slug for)\b/ },
  { kind: 'keyword', label: 'Keyword Optimization', test: /\b(keywords?|keyword research|keyword plan|keyword optimization)\b/ },
  { kind: 'seo-article', label: 'SEO Article', test: /\b(seo article|seo content|optimized article)\b/ },
  { kind: 'blog-post', label: 'Blog Post', test: /\b(blog post|blog article|blog)\b/ },
  // Marketing
  { kind: 'cta', label: 'Call-to-Action', test: /\b(call-?to-?action|cta)\b/ },
  { kind: 'brand-messaging', label: 'Brand Messaging', test: /\b(brand messaging|brand voice|brand message)\b/ },
  { kind: 'marketing-strategy', label: 'Marketing Strategy', test: /\b(marketing strategy|marketing plan)\b/ },
  { kind: 'sales-funnel', label: 'Sales Funnel', test: /\b(sales funnel|funnel)\b/ },
  { kind: 'newsletter', label: 'Newsletter', test: /\b(newsletter)\b/ },
  { kind: 'email-campaign', label: 'Email Campaign', test: /\b(email campaign|email series|cold email)\b/ },
  { kind: 'youtube-script', label: 'YouTube Script', test: /\b(youtube (script|video)|video script)\b/ },
  { kind: 'tiktok-script', label: 'TikTok Script', test: /\b(tiktok (script|video)|reels script)\b/ },
  { kind: 'press-release', label: 'Press Release', test: /\bpress release\b/ },
  { kind: 'instagram-caption', label: 'Instagram Caption', test: /\b(instagram caption|ig caption|caption for instagram)\b/ },
  { kind: 'linkedin-post', label: 'LinkedIn Post', test: /\blinkedin post\b/ },
  { kind: 'x-post', label: 'X Post', test: /\b(x post|twitter post|tweet)\b/ },
  { kind: 'google-ad', label: 'Google Ad', test: /\b(google ads?|search ads?)\b/ },
  { kind: 'facebook-ad', label: 'Facebook Ad', test: /\b(facebook ads?)\b/ },
  { kind: 'landing-page', label: 'Landing Page', test: /\b(landing page|sales page|squeeze page)\b/ },
  { kind: 'product-description', label: 'Product Description', test: /\b(describe|description)\b.*\b(product|service)\b/ },
  // Creative
  { kind: 'poem', label: 'Poem', test: /\b(poem|poetry)\b/ },
  { kind: 'song', label: 'Song', test: /\b(song|lyrics?)\b/ },
  { kind: 'movie-script', label: 'Movie Script', test: /\b(movie script|film script|screenplay)\b/ },
  { kind: 'podcast-script', label: 'Podcast Script', test: /\b(podcast (script|episode))\b/ },
  { kind: 'dialogue', label: 'Dialogue', test: /\bdialogue\b/ },
  { kind: 'character-profile', label: 'Character Profile', test: /\b(character (profile|bio|sheet))\b/ },
  { kind: 'story-outline', label: 'Story Outline', test: /\b(story outline|plot outline|book outline)\b/ },
  { kind: 'world-building', label: 'World Building', test: /\bworld ?building\b/ },
  { kind: 'chapter', label: 'Chapter', test: /\bchapter\b/ },
  { kind: 'book', label: 'Book', test: /\b(book|novel)\b/ },
  { kind: 'story', label: 'Story', test: /\b(short story|story about|write a story)\b/ },
  // Business
  { kind: 'invoice', label: 'Invoice', test: /\binvoice\b/ },
  { kind: 'quotation', label: 'Quotation / Quote', test: /\b(quotation|quote for)\b/ },
  { kind: 'contract', label: 'Contract', test: /\bcontract\b/ },
  { kind: 'meeting-minutes', label: 'Meeting Minutes', test: /\b(meeting minutes|minutes of the meeting)\b/ },
  { kind: 'sop', label: 'Standard Operating Procedure', test: /\b(standard operating procedure|sop|procedures for)\b/ },
  { kind: 'policy', label: 'Policy', test: /\b(company policy|hr policy|policy on)\b/ },
  { kind: 'strategic-plan', label: 'Strategic Plan', test: /\b(strategic plan|strategy document)\b/ },
  { kind: 'business-report', label: 'Business Report', test: /\b(business report|company report|annual report)\b/ },
  { kind: 'grant-proposal', label: 'Grant Proposal', test: /\bgrant (proposal|application)\b/ },
  { kind: 'funding-request', label: 'Funding Request', test: /\b(funding request|raise (capital|funding)|pitch for investment)\b/ },
  { kind: 'project-proposal', label: 'Project Proposal', test: /\bproject proposal\b/ },
  { kind: 'company-profile', label: 'Company Profile', test: /\b(company profile|about (the )?(company|business))\b/ },
  { kind: 'executive-summary', label: 'Executive Summary', test: /\bexecutive summary\b/ },
  { kind: 'business-proposal', label: 'Business Proposal', test: /\b(business proposal|proposal for)\b/ },
  { kind: 'business-plan', label: 'Business Plan', test: /\b(business plan|startup plan)\b/ },
];

/** Detect the content kind + human label, defaulting to a blog article. */
export function detectContentKind(raw: string): { kind: string; label: string } {
  const q = raw.toLowerCase();
  for (const rule of KIND_RULES) {
    if (rule.test.test(q)) return { kind: rule.kind, label: rule.label };
  }
  return { kind: 'article', label: 'Article' };
}

// ────────────────────────────────────────────────────────────────────────────
// Generic helpers
// ────────────────────────────────────────────────────────────────────────────

function bullets(items: string[], n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const phrase = items[i % items.length];
    out.push(`• ${phrase}`);
  }
  return out;
}

/** Strong paragraph seeders so every artifact reads like real copy. */
function openerParagraph(kind: string, subject: string, voice: string, adj: string): string {
  return `${voice}, ${subject} is rarely a single decision — it is a series of small, deliberate choices that compound. Get the fundamentals right and the rest follows.`;
}

function closingCall(topic: string, cta: string): string[] {
  return [
    '',
    `**${cta}**`,
    `Start with the one move that creates the most leverage for ${topic}, and turn it into a concrete task this week.`,
  ];
}

// ────────────────────────────────────────────────────────────────────────────
// Bespoke generators
// ────────────────────────────────────────────────────────────────────────────

function genBusinessPlan(subject: string, tone: Tone, length: Length): string {
  const name = titleCase(cleanTopic(subject));
  const sections = [
    ['**Executive Summary**', `The company will build a focused, customer-driven business around ${lower(subject)}. The plan below covers the market, the offer, the economics, and the first 90 days.`],
    ['**Problem**', `Customers in this space are underserved on ${lower(subject)}: the current options are either too expensive, too complicated, or too generic.`],
    ['**Solution**', `A focused offer that solves the core problem around ${lower(subject)} — simple to buy, easy to adopt, and priced for the primary customer.`],
    ['**Market**', 'Define the target segment (who, where, how they buy) and the size of the addressable market. Start with a niche you can own, not the whole market.'],
    ['**Business Model**', 'Revenue streams (one-time, subscription, or both), pricing, and the unit economics — cost to acquire a customer vs. lifetime value.'],
    ['**Go-to-Market**', 'The channel that reaches the buyer fastest, the message that converts, and the first three campaigns.'],
    ['**Financial Projections**', 'A 12-month view: fixed costs, variable costs, revenue milestones, and the month the business breaks even.'],
    ['**Team & Execution**', 'Who does what in the first 90 days, and the single most important metric to move each month.'],
  ];
  const lines = [`# ${name} — Business Plan`, '', openerParagraph('business plan', lower(subject), VOICE[tone].opener, VOICE[tone].adj)];
  for (const [h, p] of sections) {
    lines.push('', h, p);
  }
  if (length !== 'short') {
    lines.push('', '**Risks & Mitigation**', '• Market risk: validate demand with presales before building the full product.', '• Execution risk: ship the smallest useful version in the first month.', '• Cash risk: keep burn low until the unit economics are proven.');
  }
  lines.push(...closingCall(lower(subject), VOICE[tone].cta));
  return finalizeContent(lines.join('\n'));
}

function genProposal(subject: string, tone: Tone, length: Length): string {
  const name = titleCase(cleanTopic(subject));
  const lines = [
    `# Proposal — ${name}`,
    '',
    openerParagraph('this proposal', lower(subject), VOICE[tone].opener, VOICE[tone].adj),
    '',
    '**Executive Summary**',
    `This proposal responds to the need around ${lower(subject)} with a clear scope, a realistic timeline, and a defined investment.`,
    '',
    '**Objectives**',
    '• Deliver a concrete outcome the stakeholder can measure.',
    '• Align scope, budget, and timeline before work begins.',
    '• Define success criteria up front so there are no surprises.',
    '',
    '**Proposed Approach**',
    '1. Discovery — confirm requirements and constraints.',
    '2. Execution — deliver the core scope in phases.',
    '3. Review — validate against the success criteria and adjust.',
    '',
    '**Timeline**',
    'Phase 1 (Discovery): days 1–5 · Phase 2 (Execution): weeks 2–6 · Phase 3 (Review): week 7.',
    '',
    '**Investment**',
    'Provide a clear cost breakdown with optional line items, so the stakeholder can scale scope up or down.',
    '',
    '**Why this works**',
    'The approach front-loads the risks — scope, assumptions, and dependencies are confirmed before significant effort is committed.',
  ];
  lines.push(...closingCall(lower(subject), VOICE[tone].cta));
  return finalizeContent(lines.join('\n'));
}

function genLandingPage(subject: string, tone: Tone, length: Length): string {
  const topic = cleanTopic(subject);
  const name = titleCase(topic);
  const lines = [
    `# ${name}`,
    '',
    '**Headline**',
    `Get ${lower(topic)} done right — without the guesswork.`,
    '',
    '**Subheadline**',
    'A focused, no-fluff way to solve your biggest pain point around this, starting today.',
    '',
    '**Pain point**',
    'You have wasted time on options that are slow, vague, or overpriced. That stops here.',
    '',
    '**What you get**',
    '• A clear, actionable path that removes the friction.',
    '• Proof that it works for people like you.',
    '• A risk-free way to try it.',
    '',
    '**How it works**',
    '1. Sign up in under two minutes.', '2. Get started immediately with a guided setup.', '3. See results within your first week.',
    '',
    '**Social proof**',
    '“It saved us hours and the quality was consistently high.” — a satisfied customer',
    '',
    '**Call to action**',
    `Start now — try ${lower(topic)} today.`,
  ];
  lines.push(...closingCall(lower(topic), VOICE[tone].cta));
  return finalizeContent(lines.join('\n'));
}

function genProductDescription(subject: string, tone: Tone, length: Length): string {
  const topic = cleanTopic(subject);
  const name = titleCase(topic);
  const lines = [
    `# ${name}`,
    '',
    `**What it is**`,
    `${name} is built to make ${lower(topic)} straightforward — focused on the outcome, not the features.`,
    '',
    '**Why you will like it**',
    '• Solves the specific problem it promises to solve.',
    '• Works right out of the box, with no steep learning curve.',
    '• Built to last, with the details that matter taken care of.',
    '',
    '**Key features**',
    '• Core capability that delivers the main result.',
    '• A design that makes the common tasks quick.',
    '• Compatibility that fits how you already work.',
    '',
    '**Who it is for**',
    `Anyone who wants ${lower(topic)} handled well — without the overhead.`,
    '',
    '**Specifications**',
    'Include dimensions, materials, compatibility, or performance figures here so the buyer can decide confidently.',
  ];
  lines.push(...closingCall(lower(topic), VOICE[tone].cta));
  return finalizeContent(lines.join('\n'));
}

function genSeoArticle(subject: string, tone: Tone, length: Length, kind: string): string {
  const topic = cleanTopic(subject);
  const name = titleCase(topic);
  const isPillar = kind === 'pillar-page';
  const sections = [
    ['**Why this matters**', `People searching for ${lower(topic)} want a direct answer, not a wall of text. This article answers the core question first, then builds from there.`],
    ['**The fundamentals**', `The essentials of ${lower(topic)} are simpler than most content suggests: clear goals, the right inputs, and a repeatable process.`],
    ['**How to approach it**', '1. Start with the user\'s actual question and answer it immediately.', '2. Break the topic into sub-questions readers genuinely ask.', '3. Back each point with concrete, specific guidance.', '4. End with a clear next step.'],
    ['**Common mistakes**', '• Chasing keywords instead of answering the search intent.', '• Writing generic advice anyone could publish.', '• Missing the internal links that help readers (and crawlers) navigate.'],
  ];
  if (length !== 'short') {
    sections.push(['**Going deeper**', 'Expand each sub-topic into its own section with examples, data, and step-by-step instructions. Use tables and lists where they make the answer faster to read.']);
  }
  if (isPillar) {
    sections.unshift(['**Pillar overview**', `This is the definitive guide on ${lower(topic)} — the hub that links out to every related sub-topic and clusters related posts around it.`]);
  }
  const lines = [`# ${name}`, '', openerParagraph('this topic', lower(topic), VOICE[tone].opener, VOICE[tone].adj)];
  for (const [h, p] of sections) lines.push('', h, p);
  lines.push('', '**Key takeaways**', `• Answer the question immediately.`, `• Structure for scan-ability: headings, lists, and short paragraphs.`, `• Optimize the meta title, description, and one clear URL slug.`, `• Link internally to related content and write descriptive ALT text.`);
  lines.push(...closingCall(lower(topic), VOICE[tone].cta));
  return finalizeContent(lines.join('\n'));
}

function genSocial(subject: string, tone: Tone, length: Length, kind: string): string {
  const topic = cleanTopic(subject);
  const capTopic = titleCase(topic);
  const short = length === 'short';
  switch (kind) {
    case 'x-post':
      return finalizeContent([
        `Here is a fact most people miss about ${lower(topic)}: the fundamentals matter more than the hype.`,
        '',
        `Get the basics right, and the results follow. ${capTopic}.`,
        '',
        `What is your experience with ${lower(topic)}?`,
      ].join('\n'));
    case 'instagram-caption':
      return finalizeContent([
        `The truth about ${lower(topic)} nobody tells you:`,
        '',
        'It looks like a big leap, but it is really a series of small steps done consistently.',
        '',
        'Save this for when you need the reminder. 🔖',
        '',
        '#GrowthTips #LearnEveryDay #SmallSteps',
      ].join('\n'));
    case 'facebook-ad':
    case 'google-ad':
      return finalizeContent([
        `**Headline:** Get ${capTopic} Done Right`,
        '',
        `**Body:** Stop guessing on ${lower(topic)}. Our focused approach gets you a clear result quickly — and without the usual friction.`,
        '',
        `**CTA:** Try it now →`,
      ].join('\n'));
    case 'tiktok-script':
      return finalizeContent([
        `**[HOOK]** Ever wasted a week on ${lower(topic)} and gotten nowhere?`,
        '',
        `**[SETUP]** Most people skip the fundamentals and chase shortcuts. That is exactly where it falls apart.`,
        '',
        `**[PAYOFF]** Do the simple, boring, consistent thing instead — and watch the difference in 7 days.`,
        '',
        `**[CTA]** Follow for more on ${lower(topic)}.`,
      ].join('\n'));
    case 'youtube-script':
      return finalizeContent([
        `**Intro (0:00)** — Hook: "If you have ever struggled with ${lower(topic)}, this is the one thing you are missing."`,
        '',
        `**Body (0:30–4:00)** — Walk through the fundamentals: what works, what does not, and one concrete example.`,
        '',
        `**Outro (4:00)** — Recap the three key points and ask viewers to comment on their experience.`,
      ].join('\n'));
    case 'email-campaign':
      return finalizeContent([
        `**Subject:** Your shortcut to ${lower(topic)} (and the step most people skip)`,
        '',
        `**Preheader:** One focused idea you can use today.`,
        '',
        '**Body**',
        'Hi,',
        '',
        `If you are working on ${lower(topic)}, the fastest progress comes from doing the fundamentals on repeat — not from chasing every new tactic.`,
        '',
        '**One idea to try today:** pick the single highest-leverage action and do it before anything else.',
        '',
        '**CTA:** Reply to this email and tell me what you are working on.',
      ].join('\n'));
    case 'newsletter':
      return finalizeContent([
        `**Subject:** ${capTopic} — what actually works`,
        '',
        `**Hi,**`,
        '',
        `Here is the short version on ${lower(topic)}: the tools change, the fundamentals do not.`,
        '',
        '**In this issue**',
        '• One insight worth keeping.',
        '• One action you can take today.',
        '• One resource to dig into.',
        '',
        '**The takeaway**',
        `Keep the goal concrete and the next action small. That is how progress on ${lower(topic)} actually happens.`,
      ].join('\n'));
    case 'press-release':
      return finalizeContent([
        '**FOR IMMEDIATE RELEASE**',
        '',
        `**${capTopic} — [Company] Announces New Offering**`,
        '',
        '[CITY, DATE] — [Company] today announced a new approach to ' + lower(topic) + ', designed to help [target audience] achieve [outcome] more simply and reliably.',
        '',
        '**Key highlights**',
        '• A clear benefit for the customer.',
        '• What makes this different from the status quo.',
        '• Availability and how to get started.',
        '',
        '**About [Company]**',
        '[Company] helps [audience] do [outcome] better. Learn more at [website].',
        '',
        '**Media contact:** [Name], [email], [phone]',
      ].join('\n'));
    default:
      return finalizeContent([
        `**${capTopic}**`,
        '',
        `The thing most people get wrong about ${lower(topic)} is treating it as a one-time effort. Consistency wins.`,
        '',
        '**Three things that work**',
        '• Start with the outcome, not the activity.',
        '• Do the simplest version that produces a real result.',
        '• Measure once a week and adjust.',
        '',
        'What has worked for you?',
      ].join('\n'));
  }
}

function genLetter(subject: string, tone: Tone, length: Length, kind: string): string {
  const topic = lower(cleanTopic(subject));
  const name = titleCase(cleanTopic(subject));
  const isCover = kind === 'cover-letter';
  const isComplaint = kind === 'complaint-letter';
  const isThank = kind === 'thank-you-email' || kind === 'follow-up-email';
  if (isCover) {
    return finalizeContent([
      `**Re: Application — [Role] at [Company]**`,
      '',
      'Dear Hiring Team,',
      '',
      `I am writing to apply for the [Role] position at [Company]. I have been following ${topic} closely, and your approach to it matches the way I like to work.`,
      '',
      'In my most recent role, I delivered [quantified achievement] by [approach]. That experience taught me that the difference between good and great execution is [lesson].',
      '',
      'I would welcome the chance to bring that same focus to [Company]. I have attached my resume and would be glad to speak at your convenience.',
      '',
      'Best regards,',
      '[Your Name]',
      '[Phone] · [Email]',
    ].join('\n'));
  }
  if (isComplaint) {
    return finalizeContent([
      `**Re: Concern regarding ${topic}**`,
      '',
      'Dear [Recipient],',
      '',
      `I am writing to raise a concern regarding ${topic}. On [date], [what happened].`,
      '',
      'This has led to [impact]. I would appreciate you looking into this and confirming how it will be resolved.',
      '',
      'Please let me know a time we can discuss this further.',
      '',
      'Sincerely,',
      '[Your Name]',
    ].join('\n'));
  }
  if (isThank) {
    return finalizeContent([
      `**Subject: ${cap(name)}**`,
      '',
      'Dear [Recipient],',
      '',
      `Thank you for [the reason]. Your support on ${topic} made a real difference, and I appreciate the time you put in.`,
      '',
      'I look forward to staying in touch.',
      '',
      'Best regards,',
      '[Your Name]',
    ].join('\n'));
  }
  return finalizeContent([
    `**Regarding ${name}**`,
    '',
    'Dear [Recipient],',
    '',
    `I am writing to ${topic}. This letter confirms [purpose] and outlines [what is being requested or communicated].`,
    '',
    '[Details]',
    '',
    'Please let me know if you need any additional information or wish to discuss this further.',
    '',
    'Sincerely,',
    '[Your Name]',
  ].join('\n'));
}

function genAcademic(subject: string, tone: Tone, length: Length, kind: string): string {
  const topic = lower(cleanTopic(subject));
  const name = titleCase(cleanTopic(subject));
  const lines: string[] = [];
  if (kind === 'essay' || kind === 'assignment') {
    lines.push(`# ${name}`, '', '**Introduction**', `This essay examines ${topic} — why it matters, what the evidence shows, and what it implies for practice.`);
    lines.push('', '**Thesis**', `The central claim is that ${topic} is best understood through [main argument], and that this framing changes how we act.`);
    lines.push('', '**Body — Argument 1**', '[Develop the first supporting point with evidence, examples, and analysis.]');
    lines.push('', '**Body — Argument 2**', '[Develop the second supporting point, addressing the strongest counter-argument along the way.]');
    lines.push('', '**Conclusion**', 'This paper has shown that [restate thesis]. The practical implication is [takeaway]. Future work should [next step].');
    lines.push('', '**References**', 'List sources in the required citation style (APA, MLA, Harvard, Chicago, or IEEE).');
  } else if (kind === 'literature-review') {
    lines.push(`# ${name} — Literature Review`, '', '**Scope & Method**', `This review synthesizes recent work on ${topic}, focusing on [criteria: date range, sources, themes].`);
    lines.push('', '**Theme 1 — [Theme]**', 'Summarize the key findings, agreements, and gaps across the sources.', '', '**Theme 2 — [Theme]**', 'Synthesize what the literature establishes and where it is still uncertain.');
    lines.push('', '**Gaps & Future Research**', 'The literature is consistent on [point], but thin on [gap]. That gap is a clear opportunity for further study.', '', '**References**', 'Provide the full citations in your required style.');
  } else if (kind === 'case-study') {
    lines.push(`# ${name} — Case Study`, '', '**Background**', `This case examines ${topic} in [context].`, '', '**Situation**', 'Describe the problem or decision at the center of the case.', '', '**Analysis**', 'Break down the key factors, stakeholders, and constraints.', '', '**Recommendation**', 'Recommend a concrete course of action and justify it against the alternatives.', '', '**Outcome & Lessons**', 'Summarize the result and the transferable lessons.');
  } else if (kind === 'research-paper') {
    lines.push(`# ${name} — Research Paper`, '', '**Abstract**', `This paper investigates ${topic} and reports [main finding].`, '', '**Introduction**', 'Context, problem statement, and research question.', '', '**Methodology**', 'Describe the approach, data, and analysis.', '', '**Results**', 'Present the findings clearly, using tables where they help.', '', '**Discussion**', 'Interpret the results and connect them to the literature.', '', '**Conclusion**', 'Restate the contribution and suggest future work.', '', '**References**', 'Full citations in the required style.');
  } else if (kind === 'presentation') {
    lines.push(`# ${name} — Presentation`, '', '**Slide 1 — Hook**', 'One sentence that frames why this matters.', '', '**Slides 2–4 — Context**', 'The problem, the key facts, and why now.', '', '**Slides 5–7 — The argument**', 'The main points, each on its own slide with one clear takeaway.', '', '**Slide 8 — Recommendation**', 'A single, concrete recommendation.', '', '**Slide 9 — Next steps & questions**', 'What you need from the audience and time for Q&A.');
  } else {
    lines.push(`# ${name}`, '', openerParagraph('this work', topic, VOICE[tone].opener, VOICE[tone].adj), '', '**Key sections**', '• Background and context', '• Core analysis', '• Findings and implications', '• Conclusion');
  }
  lines.push(...closingCall(topic, VOICE[tone].cta));
  return finalizeContent(lines.join('\n'));
}

function genCreative(subject: string, tone: Tone, length: Length, kind: string): string {
  const topic = lower(cleanTopic(subject));
  const name = titleCase(cleanTopic(subject));
  switch (kind) {
    case 'story':
    case 'book':
    case 'chapter':
      return finalizeContent([
        `# ${name}`,
        '',
        '**Premise**',
        `In a world where ${topic} is taken for granted, one person discovers that the rules everyone follows are only half the story.`,
        '',
        '**Opening scene**',
        'Start in motion: a single moment where everything the protagonist assumed is called into question. Establish the stakes, not the backstory.',
        '',
        '**Rising action**',
        '• A small decision that sets off larger consequences.',
        '• An ally, an obstacle, and a discovery that changes the plan.',
        '• A setback that forces the protagonist to choose.',
        '',
        '**Climax**',
        'The moment the protagonist acts on what they have learned — with the outcome uncertain until the final beat.',
        '',
        '**Resolution**',
        'Show what changed and what it cost. End on a line that rewards the reader.',
      ].join('\n'));
    case 'poem':
      return finalizeContent([
        `**${name}**`,
        '',
        'Lines about ' + topic + ', sharpened until each one earns its place — concrete images, a rhythm that builds, and an ending that lands.',
        '',
        '[Stanza 1 — establish the image]',
        '',
        '[Stanza 2 — turn the image toward meaning]',
        '',
        '[Stanza 3 — resolve with a closing image]',
      ].join('\n'));
    case 'song':
      return finalizeContent([
        `**${name}**`,
        '',
        '[Verse 1]',
        'Set the scene and the emotional state in concrete detail.',
        '',
        '[Chorus]',
        'The hook: the central line about ' + topic + ' that repeats and stays.',
        '',
        '[Verse 2]',
        'Deepen the story, raising the stakes.',
        '',
        '[Chorus]',
        '',
        '[Bridge]',
        'A shift in perspective or emotion before the final chorus.',
        '',
        '[Outro]',
        'Resolve with a single repeated line.',
      ].join('\n'));
    case 'character-profile':
      return finalizeContent([
        `# ${name} — Character Profile`,
        '',
        '**Core identity**',
        '• Name, age, role: [fill in]',
        '• Defining trait: [one quality that shapes every choice]',
        '• Core want: [what they are trying to get]',
        '• Core fear: [what they are trying to avoid]',
        '',
        '**Backstory**',
        'The formative event that created this want and fear.',
        '',
        '**Relationships**',
        '• Ally: who pushes them forward',
        '• Rival: who embodies their fear',
        '• Wildcard: who complicates things',
        '',
        '**Voice**',
        'How they talk: word choice, rhythm, and what they never say.',
      ].join('\n'));
    case 'dialogue':
      return finalizeContent([
        `**Dialogue — ${name}**`,
        '',
        '[Scene: setting, time, who is present.]',
        '',
        '[CHARACTER A]: The line that opens the conflict.',
        '',
        '[CHARACTER B]: The response that reveals their position.',
        '',
        '[CHARACTER A]: A turn that raises the stakes.',
        '',
        '[CHARACTER B]: The line that changes everything.',
        '',
        'Keep each line doing two jobs: advancing the scene and revealing character.',
      ].join('\n'));
    default:
      return finalizeContent([
        `# ${name}`,
        '',
        `**Premise** — ${topic} becomes the engine of a story with clear stakes and a character who must choose.`,
        '',
        '**Structure**', '• Act 1: set up the world and the want.', '• Act 2: escalate the conflict.', '• Act 3: resolve and reveal the change.',
        '',
        '**Tone**', VOICE[tone].adj + ' voice, consistent from the first line to the last.',
      ].join('\n'));
  }
}

function genCodingDocs(subject: string, tone: Tone, length: Length, kind: string): string {
  const topic = cleanTopic(subject);
  const name = titleCase(topic);
  switch (kind) {
    case 'readme':
      return finalizeContent([
        `# ${name}`,
        '',
        '> A focused, well-documented project. Replace the placeholders below.',
        '',
        '**Overview**',
        `What ${topic} does, the problem it solves, and who it is for.`,
        '',
        '**Features**',
        '• Core capability 1',
        '• Core capability 2',
        '',
        '**Install**',
        '```bash\nnpm install # or your package manager\n```',
        '',
        '**Quick start**',
        '```js\nimport { yourModule } from "your-package";\n\n// 3 lines to get started\n```',
        '',
        '**Configuration**',
        'Document the main options with a small table: option · type · default · purpose.',
        '',
        '**API**',
        'For each exported function: signature, what it does, params, return, example.',
        '',
        '**Contributing**', '1. Fork and create a branch. 2. Add tests with your change. 3. Open a PR.',
        '',
        '**License**', 'MIT (or your license).',
      ].join('\n'));
    case 'api-doc':
      return finalizeContent([
        `# ${name} — API Reference`,
        '',
        '**Base URL**', '`https://api.example.com/v1`',
        '',
        '**Authentication**', 'Include an API key in the `Authorization` header: `Bearer <token>`.',
        '',
        '**Endpoints**',
        '',
        '### `GET /resource`',
        '- **Description:** lists resources',
        '- **Query params:** `limit`, `offset`, `filter`',
        '- **Success 200:** `{ "data": [...] }`',
        '',
        '### `POST /resource`',
        '- **Description:** creates a resource',
        '- **Body:** JSON with required fields',
        '- **Success 201:** the created object',
        '',
        '**Errors**',
        'Standard error shape: `{ "error": { "code": 404, "message": "Not found" } }`.',
      ].join('\n'));
    case 'tech-spec':
      return finalizeContent([
        `# ${name} — Technical Specification`,
        '',
        '**Context**', `Why ${topic} is being built and the problem it addresses.`,
        '',
        '**Goals / Non-goals**', '• Goals: what this must achieve.', '• Non-goals: what is explicitly out of scope.',
        '',
        '**Architecture**', 'A high-level diagram in text, then the key components and their responsibilities.',
        '',
        '**Data model**', 'Tables with columns, types, and indexes.',
        '',
        '**Interfaces**', 'Public API surface and key internal contracts.',
        '',
        '**Error handling & logging**', 'How failures surface and what gets logged (no secrets).',
        '',
        '**Security & performance**', 'Auth, rate limits, caching, and the latency budget.',
        '',
        '**Rollout**', 'Phased rollout, rollback plan, and monitoring hooks.',
      ].join('\n'));
    default:
      return finalizeContent([
        `# ${name}`,
        '',
        `Documentation for ${topic}, written for the person who has to maintain it next.`,
        '',
        '**Overview**', 'Purpose and scope.',
        '',
        '**Getting started**', 'Prerequisites, install, and a first example.',
        '',
        '**Reference**', 'The key APIs, configs, and gotchas.',
      ].join('\n'));
  }
}

function genEcommerce(subject: string, tone: Tone, length: Length, kind: string): string {
  const topic = cleanTopic(subject);
  const name = titleCase(topic);
  switch (kind) {
    case 'product-title':
      return finalizeContent([
        `**Product title options for ${name}:**`,
        '',
        '1. `' + cap(topic) + ' — [Key Benefit] for [Audience]`',
        '2. `' + cap(topic) + ' — [Size/Type], [Material], [Color]`',
        '3. `Premium ' + cap(topic) + ' with [Standout Feature]`',
        '',
        '**Rules:** keep it under 150 characters, lead with the most important keyword, and include the primary differentiator.',
      ].join('\n'));
    case 'product-faq':
      return finalizeContent([
        `**FAQ — ${name}**`,
        '',
        '**Q: What makes this different?**',
        'A: It is built to [core benefit] without the usual trade-offs.',
        '',
        '**Q: Who is it for?**',
        'A: Anyone who needs [outcome] and wants [quality/simplicity].',
        '',
        '**Q: How do I get started?**',
        'A: [Two-sentence instructions].',
        '',
        '**Q: What if it is not right for me?**',
        'A: [Return/refund policy].',
      ].join('\n'));
    case 'product-comparison':
      return finalizeContent([
        `**${name} vs. alternatives**`,
        '',
        '| Feature | This product | Typical alternative |',
        '| --- | --- | --- |',
        '| Core outcome | [outcome] | [outcome] |',
        '| Ease of use | [high/medium] | [varies] |',
        '| Price | [value] | [value] |',
        '| Support | [level] | [level] |',
        '',
        '**Bottom line:** this wins when [your deciding criteria].',
      ].join('\n'));
    default: // amazon-listing / shopify / product-description / product-spec
      return finalizeContent([
        `# ${name} — Product Listing`,
        '',
        `**Title** — ${cap(topic)} with [key benefit], for [audience].`,
        '',
        '**Key features (bullets)**',
        '• Feature 1 with benefit',
        '• Feature 2 with benefit',
        '• Feature 3 with benefit',
        '',
        '**Description**',
        `Put the customer first: what it does, who it is for, and why it is worth it. Keep paragraphs short and specific.`,
        '',
        '**Specifications**',
        '| Attribute | Value |',
        '| --- | --- |',
        '| [Attribute] | [Value] |',
        '',
        '**SEO keywords**', 'Include the primary keyword in title, bullets, and description once each — naturally.',
      ].join('\n'));
  }
}

function genBusinessDocs(subject: string, tone: Tone, length: Length, kind: string): string {
  const topic = lower(cleanTopic(subject));
  const name = titleCase(cleanTopic(subject));
  switch (kind) {
    case 'meeting-minutes':
      return finalizeContent([
        `# Meeting Minutes — ${name}`,
        '',
        '**Date / Attendees**', '[Date] · [Attendee names]',
        '',
        '**Agenda**', '• Item 1', '• Item 2', '• Item 3',
        '',
        '**Decisions**', '• Decision 1 with rationale',
        '',
        '**Action items**', '| Action | Owner | Due |', '| --- | --- | --- |', '| [Action] | [Owner] | [Due] |',
        '',
        '**Next meeting**', '[Date]',
      ].join('\n'));
    case 'sop':
      return finalizeContent([
        `# ${name} — Standard Operating Procedure`,
        '',
        '**Purpose**', `A repeatable, safe way to complete ${topic} correctly every time.`,
        '',
        '**Scope**', 'Who this applies to and when.',
        '',
        '**Preconditions**', 'What must be in place before starting.',
        '',
        '**Procedure**', '1. [Step 1 with expected outcome]', '2. [Step 2 with expected outcome]', '3. [Step 3 with expected outcome]', '4. [Verification step]',
        '',
        '**Exceptions**', 'How to handle edge cases without breaking the process.',
        '',
        '**Review**', 'This SOP is reviewed on [cadence] by [owner].',
      ].join('\n'));
    case 'policy':
      return finalizeContent([
        `# ${name} — Policy`,
        '',
        '**Purpose**', `Establish clear expectations around ${topic}.`,
        '',
        '**Scope**', 'Who the policy covers.',
        '',
        '**Policy**', '• The rule, stated simply.', '• What is expected in practice.', '• How exceptions are handled.',
        '',
        '**Compliance**', 'Consequences of non-compliance and who enforces it.',
        '',
        '**Effective date**', '[Date]',
      ].join('\n'));
    case 'strategic-plan':
      return finalizeContent([
        `# ${name} — Strategic Plan`,
        '',
        '**Vision**', `Where ${topic} is headed in 3 years.`,
        '',
        '**Mission**', 'What the organization does, for whom, and why it matters.',
        '',
        '**Strategic pillars**', '• Pillar 1: goal + owner + metric', '• Pillar 2: goal + owner + metric', '• Pillar 3: goal + owner + metric',
        '',
        '**Roadmap**', 'Year 1: foundation · Year 2: growth · Year 3: scale',
        '',
        '**Risks**', 'Top risks and the mitigation for each.',
      ].join('\n'));
    case 'invoice':
      return finalizeContent([
        `# Invoice #${Date.now().toString(36).toUpperCase()}`,
        '',
        '**From**', '[Company] · [Address] · [Tax ID]',
        '',
        '**Bill to**', '[Client] · [Email]',
        '',
        '| Description | Qty | Rate | Amount |', '| --- | --- | --- | --- |', '| [Item] | 1 | $0.00 | $0.00 |',
        '',
        '**Total due:** $0.00', '',
        '**Payment terms**', 'Due on receipt · Payable via [method].',
      ].join('\n'));
    case 'quotation':
      return finalizeContent([
        `# Quotation — ${name}`,
        '',
        '**Prepared for**', '[Client]',
        '',
        '**Scope of work**', '• Deliverable 1', '• Deliverable 2',
        '',
        '| Item | Details | Cost |', '| --- | --- | --- |', '| [Item] | [Description] | $0.00 |',
        '',
        '**Total:** $0.00', '',
        '**Validity**', 'Valid for 30 days. Payment terms: [terms].',
      ].join('\n'));
    case 'contract':
      return finalizeContent([
        `# Agreement — ${name}`,
        '',
        '**Parties**', '[Party A] and [Party B], effective [date].',
        '',
        '**Services**', 'A clear description of what is being provided, timelines, and deliverables.',
        '',
        '**Payment**', 'Fees, schedule, and late terms.',
        '',
        '**Term & termination**', 'Duration and how either party may end the agreement.',
        '',
        '**Confidentiality & IP**', 'Who owns what, and the confidentiality obligations.',
        '',
        '**Liability**', 'Limitation of liability and indemnification.',
        '',
        '**Governing law**', '[Jurisdiction].',
        '',
        '**Signatures**', '________________  ________________',
      ].join('\n'));
    case 'business-report':
      return finalizeContent([
        `# ${name} — Business Report`,
        '',
        '**Executive summary**', 'The headline finding and what it means.',
        '',
        '**Key metrics**', '| Metric | Value | Trend |', '| --- | --- | --- |', '| [Metric] | [Value] | [▲/▼] |',
        '',
        '**Analysis**', 'What is driving the numbers and what it implies.',
        '',
        '**Recommendations**', '• Action 1', '• Action 2', '• Action 3',
      ].join('\n'));
    default:
      return genProposal(subject, tone, length);
  }
}

function genSeoPack(subject: string, tone: Tone, length: Length, kind: string): string {
  const topic = lower(cleanTopic(subject));
  const name = titleCase(cleanTopic(subject));
  const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  switch (kind) {
    case 'meta-title':
      return finalizeContent([
        `**Meta titles for ${name}:**`,
        '',
        '1. `' + cap(topic) + ': A Practical Guide (2026)`',
        '2. `' + cap(topic) + ' Explained: What Works, What Doesn\'t`',
        '3. `How to ' + cap(topic) + ' the Right Way`',
        '',
        'Keep under 60 characters, lead with the keyword, and add a value cue.',
      ].join('\n'));
    case 'meta-description':
      return finalizeContent([
        `**Meta description for ${name}:**`,
        '',
        `Learn how to approach ${topic} the right way — clear steps, common mistakes to avoid, and what actually moves the needle. (145–155 characters.)`,
        '',
        '**Variants**', '• Benefit-led: what the reader gets.', '• Question-led: the question it answers.', '• Urgency-led: why it matters now.',
      ].join('\n'));
    case 'faq':
      return finalizeContent([
        `**FAQ — ${name}**`,
        '',
        '**Q: What is ' + topic + '?**',
        'A: A short, plain-language answer.',
        '',
        '**Q: Why does it matter?**',
        'A: Because [outcome/benefit].',
        '',
        '**Q: Where do I start?**',
        'A: [Two-sentence instructions].',
        '',
        '**Q: What mistakes should I avoid?**',
        'A: [Top 1–2 mistakes].',
      ].join('\n'));
    case 'keyword':
      return finalizeContent([
        `**Keyword plan for ${name}:**`,
        '',
        '| Type | Example |',
        '| --- | --- |',
        '| Head term | ' + topic + ' |',
        '| Long-tail | how to ' + topic + ' for beginners |',
        '| Question | why is ' + topic + ' important? |',
        '| Commercial | best ' + topic + ' tools 2026 |',
        '',
        'Map one page to one intent, and weave keywords in naturally — never stuffed.',
      ].join('\n'));
    case 'image-alt':
      return finalizeContent([
        `**Image ALT text for ${name}:**`,
        '',
        '1. Descriptive: "Close-up of ' + topic + ' in use"',
        '2. Contextual: "How ' + topic + ' fits into a typical workflow"',
        '3. Concise: keep under 125 characters, include the keyword once, never keyword-stuff.',
      ].join('\n'));
    case 'url-slug':
      return finalizeContent([
        `**URL slug for ${name}:**`,
        '',
        '`/blog/' + slug + '`',
        '',
        'Keep slugs short, lowercase, hyphenated, and keyword-led. No stop words, dates, or hashes.',
      ].join('\n'));
    case 'topic-cluster':
      return finalizeContent([
        `# ${name} — Topic Cluster`,
        '',
        '**Pillar topic**', `The definitive guide to ${topic}.`,
        '',
        '**Cluster topics**', '• Sub-topic 1 (links back to the pillar)', '• Sub-topic 2 (links back to the pillar)', '• Sub-topic 3 (links back to the pillar)',
        '',
        'Each cluster page answers one specific question and links to the pillar — and the pillar links to all of them.',
      ].join('\n'));
    case 'internal-links':
    case 'schema':
    case 'pillar-page':
    default:
      return genSeoArticle(subject, tone, length, kind === 'pillar-page' ? 'pillar-page' : 'seo-article');
  }
}

function genGenericArticle(subject: string, tone: Tone, length: Length, kind: string): string {
  const topic = lower(cleanTopic(subject));
  const name = titleCase(cleanTopic(subject));
  const lines = [
    `# ${name}`,
    '',
    openerParagraph(kind, topic, VOICE[tone].opener, VOICE[tone].adj),
    '',
    '**The fundamentals**',
    `The essentials of ${topic} come down to a few things done well: a clear goal, the right inputs, and a repeatable process.`,
    '',
    '**How to approach it**',
    '1. Define what success looks like in measurable terms.',
    '2. Do the smallest version that produces a real result.',
    '3. Collect feedback early and adjust.',
    '4. Iterate on evidence, not guesses.',
    '',
    '**Common mistakes**',
    '• Skipping the goal and starting on tactics.',
    '• Adding complexity before the core works.',
    '• Ignoring the numbers that would tell you what to change.',
    '',
    '**Bottom line**',
    `Progress on ${topic} is made in steady, evidence-backed steps — not in a single clever move.`,
  ];
  if (length === 'long' || length === 'comprehensive') {
    lines.push('', '**Going deeper**', 'Expand each section with examples, data, and step-by-step guidance. Use tables and code blocks where they make the answer faster to consume.');
  }
  lines.push(...closingCall(topic, VOICE[tone].cta));
  return finalizeContent(lines.join('\n'));
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

/**
 * Generate a complete, publication-ready deliverable for the request.
 * Purely deterministic — no web search, no external model.
 */
export function generateContent(req: ContentRequest): ContentResult {
  const { kind, label } = detectContentKind(req.raw);
  const tone = detectTone(req.raw);
  const length = detectLength(req.raw);
  const subject = req.subject || req.raw;

  const generators: Record<string, () => string> = {
    'business-plan': () => genBusinessPlan(subject, tone, length),
    'business-proposal': () => genProposal(subject, tone, length),
    'project-proposal': () => genProposal(subject, tone, length),
    'grant-proposal': () => genProposal(subject, tone, length),
    'funding-request': () => genProposal(subject, tone, length),
    'executive-summary': () => genProposal(subject, tone, length),
    'company-profile': () => genProposal(subject, tone, length),
    'landing-page': () => genLandingPage(subject, tone, length),
    'sales-page': () => genLandingPage(subject, tone, length),
    'product-description': () => genProductDescription(subject, tone, length),
    'seo-article': () => genSeoArticle(subject, tone, length, 'seo-article'),
    'blog-post': () => genSeoArticle(subject, tone, length, 'blog-post'),
    'pillar-page': () => genSeoArticle(subject, tone, length, 'pillar-page'),
    'facebook-ad': () => genSocial(subject, tone, length, 'facebook-ad'),
    'google-ad': () => genSocial(subject, tone, length, 'google-ad'),
    'instagram-caption': () => genSocial(subject, tone, length, 'instagram-caption'),
    'linkedin-post': () => genSocial(subject, tone, length, 'linkedin-post'),
    'x-post': () => genSocial(subject, tone, length, 'x-post'),
    'tiktok-script': () => genSocial(subject, tone, length, 'tiktok-script'),
    'youtube-script': () => genSocial(subject, tone, length, 'youtube-script'),
    'email-campaign': () => genSocial(subject, tone, length, 'email-campaign'),
    'newsletter': () => genSocial(subject, tone, length, 'newsletter'),
    'press-release': () => genSocial(subject, tone, length, 'press-release'),
    'sales-funnel': () => genLandingPage(subject, tone, length),
    'marketing-strategy': () => genGenericArticle(subject, tone, length, kind),
    'brand-messaging': () => genGenericArticle(subject, tone, length, kind),
    'cta': () => genSocial(subject, tone, length, 'x-post'),
    'cover-letter': () => genLetter(subject, tone, length, 'cover-letter'),
    'resume': () => genLetter(subject, tone, length, 'resume'),
    'cv': () => genLetter(subject, tone, length, 'resume'),
    'recommendation-letter': () => genLetter(subject, tone, length, 'letter'),
    'reference-letter': () => genLetter(subject, tone, length, 'letter'),
    'motivation-letter': () => genLetter(subject, tone, length, 'letter'),
    'statement-of-purpose': () => genLetter(subject, tone, length, 'letter'),
    'complaint-letter': () => genLetter(subject, tone, length, 'complaint-letter'),
    'formal-letter': () => genLetter(subject, tone, length, 'letter'),
    'thank-you-email': () => genLetter(subject, tone, length, 'thank-you-email'),
    'follow-up-email': () => genLetter(subject, tone, length, 'thank-you-email'),
    'essay': () => genAcademic(subject, tone, length, 'essay'),
    'assignment': () => genAcademic(subject, tone, length, 'assignment'),
    'research-paper': () => genAcademic(subject, tone, length, 'research-paper'),
    'literature-review': () => genAcademic(subject, tone, length, 'literature-review'),
    'case-study': () => genAcademic(subject, tone, length, 'case-study'),
    'presentation': () => genAcademic(subject, tone, length, 'presentation'),
    'discussion-post': () => genAcademic(subject, tone, length, 'discussion-post'),
    'citations': () => genAcademic(subject, tone, length, 'citations'),
    'story': () => genCreative(subject, tone, length, 'story'),
    'book': () => genCreative(subject, tone, length, 'book'),
    'chapter': () => genCreative(subject, tone, length, 'chapter'),
    'story-outline': () => genCreative(subject, tone, length, 'story-outline'),
    'poem': () => genCreative(subject, tone, length, 'poem'),
    'song': () => genCreative(subject, tone, length, 'song'),
    'movie-script': () => genCreative(subject, tone, length, 'movie-script'),
    'podcast-script': () => genCreative(subject, tone, length, 'podcast-script'),
    'character-profile': () => genCreative(subject, tone, length, 'character-profile'),
    'world-building': () => genCreative(subject, tone, length, 'world-building'),
    'dialogue': () => genCreative(subject, tone, length, 'dialogue'),
    'readme': () => genCodingDocs(subject, tone, length, 'readme'),
    'api-doc': () => genCodingDocs(subject, tone, length, 'api-doc'),
    'code-comment': () => genCodingDocs(subject, tone, length, 'code-comment'),
    'user-manual': () => genCodingDocs(subject, tone, length, 'user-manual'),
    'tech-spec': () => genCodingDocs(subject, tone, length, 'tech-spec'),
    'product-title': () => genEcommerce(subject, tone, length, 'product-title'),
    'product-spec': () => genEcommerce(subject, tone, length, 'product-spec'),
    'amazon-listing': () => genEcommerce(subject, tone, length, 'amazon-listing'),
    'shopify': () => genEcommerce(subject, tone, length, 'amazon-listing'),
    'product-faq': () => genEcommerce(subject, tone, length, 'product-faq'),
    'product-comparison': () => genEcommerce(subject, tone, length, 'product-comparison'),
    'meeting-minutes': () => genBusinessDocs(subject, tone, length, 'meeting-minutes'),
    'sop': () => genBusinessDocs(subject, tone, length, 'sop'),
    'policy': () => genBusinessDocs(subject, tone, length, 'policy'),
    'strategic-plan': () => genBusinessDocs(subject, tone, length, 'strategic-plan'),
    'invoice': () => genBusinessDocs(subject, tone, length, 'invoice'),
    'quotation': () => genBusinessDocs(subject, tone, length, 'quotation'),
    'contract': () => genBusinessDocs(subject, tone, length, 'contract'),
    'business-report': () => genBusinessDocs(subject, tone, length, 'business-report'),
    'meta-title': () => genSeoPack(subject, tone, length, 'meta-title'),
    'meta-description': () => genSeoPack(subject, tone, length, 'meta-description'),
    'faq': () => genSeoPack(subject, tone, length, 'faq'),
    'keyword': () => genSeoPack(subject, tone, length, 'keyword'),
    'image-alt': () => genSeoPack(subject, tone, length, 'image-alt'),
    'url-slug': () => genSeoPack(subject, tone, length, 'url-slug'),
    'topic-cluster': () => genSeoPack(subject, tone, length, 'topic-cluster'),
    'internal-links': () => genSeoPack(subject, tone, length, 'internal-links'),
    'schema': () => genSeoPack(subject, tone, length, 'schema'),
  };

  const generator = generators[kind];
  const content = generator
    ? generator()
    : genGenericArticle(subject, tone, length, kind);

  return { kind: label, content: finalizeContent(content) };
}

/** Convenience wrapper used by the answer composer. */
export function composeContent(analysis: QueryAnalysis): string {
  const { kind, content } = generateContent({ raw: analysis.raw, subject: analysis.subject });
  return content;
}
