/**
 * Brain Humanizer — makes generated text read like an experienced engineer.
 *
 * Applies deterministic, low-risk rewrites (no extra model call) so every
 * response sounds human. The heavier LLM-assisted humanizer exists elsewhere
 * (`@/lib/core/humanize`) and is not run per-chat because it doubles latency.
 */
const GENERIC_OPENINGS = [
  'as an ai', 'as a language model', 'as an ai language model',
  'certainly!', 'of course!', 'absolutely!',
];

const BUZZWORDS = [
  'leverage', 'optimize', 'streamline', 'facilitate', 'foster', 'navigate', 'delve',
  'unlock', 'harness', 'elevate', 'pivotal', 'landscape', 'ecosystem', 'paradigm',
  'robust', 'seamless', 'transformative', 'cutting-edge', 'game-changing',
  'actionable', 'scalable', 'holistic', 'tightly-knit', 'synergy',
];

const STIFF_TRANSITIONS = [
  'Furthermore,', 'Moreover,', 'Additionally,', 'Nevertheless,', 'Consequently,',
  'In conclusion,', 'In summary,',
];

export interface HumanizeReport {
  humanized: string;
  changes: number;
}

export function humanize(text: string): HumanizeReport {
  let out = text.trim();
  let changes = 0;

  // Strip leading robotic openings.
  const lower = out.toLowerCase();
  for (const opening of GENERIC_OPENINGS) {
    if (lower.startsWith(opening)) {
      const after = out.slice(opening.length).trim();
      out = after.length > 0 ? after : out;
      changes++;
      break;
    }
  }

  // Replace stiff transitions with natural connectors (case-aware).
  const transitionMap: Array<[RegExp, string]> = [
    [/Furthermore,/g, 'Plus,'],
    [/Moreover,/g, 'Also,'],
    [/Additionally,/g, 'And'],
    [/Nevertheless,/g, 'Still,'],
    [/Consequently,/g, 'So'],
    [/In conclusion,/g, ''],
    [/In summary,/g, ''],
  ];
  for (const [re, rep] of transitionMap) {
    if (re.test(out)) {
      out = out.replace(re, rep === '' ? rep : `${rep}`);
      changes++;
    }
  }

  // Soften the most grating buzzwords contextually.
  for (const buzz of BUZZWORDS) {
    const re = new RegExp(`\\b${buzz}\\b`, 'gi');
    if (re.test(out)) {
      // Conservative: only remove fully redundant ones we can map safely.
      const mapped =
        buzz === 'leverage' ? 'use'
        : buzz === 'optimize' ? 'improve'
        : buzz === 'facilitate' ? 'help with'
        : buzz === 'robust' ? 'reliable'
        : buzz === 'seamless' ? 'smooth'
        : buzz === 'actionable' ? 'practical'
        : '';
      if (mapped) {
        out = out.replace(re, mapped);
        changes++;
      }
    }
  }

  return { humanized: out, changes };
}