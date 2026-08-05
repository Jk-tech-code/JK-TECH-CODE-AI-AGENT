/**
 * Brain Learning — lightweight adaptation from past interactions.
 *
 * Smoothly adjusts the Brain's operating defaults (response length, verbosity,
 * openness to detail) from explicit user preferences and simple observable
 * signals. This is deliberately small and deterministic — no heavy ML.
 */
import { createLogger } from '@/lib/logging/logger';

const learningLogger = createLogger('brain:learning');

export interface LearningProfile {
  /** 'short' | 'balanced' | 'detailed' */
  preferredLength: string;
  /** Preferred programming language, if the user has stated one. */
  preferredLanguage: string | null;
  /** High-signal preferences automatically recorded. */
  notes: string[];
  /** Total tracked signals. */
  samples: number;
}

const RETAINED_SIGNALS = 20;

class LearningProfileStore {
  private profiles = new Map<string, LearningProfile>();

  private blank(): LearningProfile {
    return { preferredLength: 'balanced', preferredLanguage: null, notes: [], samples: 0 };
  }

  /** Capture a language preference from an explicit statement. */
  learnLanguage(userKey: string, query: string): void {
    const m = /(?:i (?:use|write|code|prefer)\w*|preferred language is|my language is) ([a-z+#. ]{2,24})/i.exec(query);
    if (m) {
      const lang = m[1].trim().toLowerCase();
      const profile = this.profiles.get(userKey) ?? this.blank();
      profile.preferredLanguage = lang;
      profile.notes = [...profile.notes.filter((n) => !n.startsWith('language:')), `language: ${lang}`].slice(-RETAINED_SIGNALS);
      profile.samples = Math.min(profile.samples + 1, 1000);
      this.profiles.set(userKey, profile);
      learningLogger.info('Learned language preference', { userKey, language: lang });
    }
  }

  /** Adjust preferred answer length from length-related preferences. */
  learnLength(userKey: string, query: string): void {
    const profile = this.profiles.get(userKey) ?? this.blank();
    if (/\b(detailed|in depth|comprehensive|long|thorough)\b/i.test(query)) {
      profile.preferredLength = 'detailed';
    } else if (/\b(short|brief|concise|tl;dr|to the point|quick)\b/i.test(query)) {
      profile.preferredLength = 'short';
    }
    profile.samples++;
    this.profiles.set(userKey, profile);
  }

  get(userKey: string): LearningProfile {
    return this.profiles.get(userKey) ?? this.blank();
  }
}

export const brainLearning = new LearningProfileStore();