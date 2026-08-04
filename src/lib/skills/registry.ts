import { promises as fs } from 'fs';
import path from 'path';
import { parseFrontmatter, getPath, extractBodyDescription, type ParsedFrontmatter } from './frontmatter';
import type { SkillDefinition } from './types';
import { createLogger } from '@/lib/logging/logger';

const registryLogger = createLogger('skill-registry');

/** Skills that exist in the codebase but are not LLM-executable without tooling. */
const NON_EXECUTABLE = new Set([
  'agent-browser', 'ASR', 'TTS', 'VLM', 'LLM', 'skill-finder-cn', 'web-shader-extractor',
]);

/** Keyword hints that let the router match a request to a skill. */
const KEYWORD_HINTS: Record<string, string[]> = {
  'coding-agent': ['code', 'bug', 'debug', 'function', 'api', 'program', 'syntax', 'script'],
  'fullstack-dev': ['fullstack', 'website', 'web app', 'end-to-end', 'saas'],
  'blog-writer': ['blog', 'blog post', 'article'],
  'seo-content-writer': ['seo', 'content', 'keyword', 'ranks'],
  'content-strategy': ['content strategy', 'content calendar', 'editorial'],
  'writing-plans': ['plan', 'implementation plan', 'roadmap'],
  'market-research-reports': ['market research', 'market report', 'industry analysis'],
  'marketing-mode': ['marketing', 'campaign', 'funnel', 'branding', 'ads'],
  'resume-builder': ['resume', 'cv'],
  'jd-resume-tailor': ['job description', 'tailor resume', 'ats'],
  'interview-prep': ['interview', 'interview prep'],
  'image-generation': ['generate image', 'create image', 'art', 'poster'],
  'image-understand': ['analyze image', 'understand image'],
  'image-edit': ['edit image', 'remove background'],
  'video-generation': ['generate video', 'video'],
  'pdf': ['pdf', 'pdf report', 'pdf document'],
  'docx': ['word document', 'docx', 'letter', 'contract'],
  'pptx': ['powerpoint', 'slides', 'deck', 'pptx'],
  'xlsx': ['excel', 'spreadsheet', 'xlsx', 'dashboard', 'pivot'],
  'finance': ['finance', 'financial', 'budget', 'revenue'],
  'stock-analysis-skill': ['stock', 'ticker', 'buy', 'sell', 'dividend'],
  'charts': ['chart', 'graph', 'visualization'],
  'quiz-mastery': ['quiz', 'assessment', 'question bank'],
  'web-search': ['search the web', 'latest', 'current', 'news'],
  'multi-search-engine': ['search', 'sources', 'cross-reference'],
  'ui-ux-pro-max': ['ui', 'ux', 'interface', 'design'],
  'visual-design-foundations': ['design', 'color', 'typography'],
  'podcast-generate': ['podcast', 'audio'],
  'skill-creator': ['create a skill', 'new skill'],
  'design': ['design', 'brand', 'logo'],
};

export class DynamicSkillRegistry {
  private skills = new Map<string, SkillDefinition>();
  private scanned = false;
  private scanPromise: Promise<void> | null = null;

  /** Lazily scan the /skills directory once. Safe to call many times. */
  async init(): Promise<void> {
    if (this.scanned) return;
    if (this.scanPromise) return this.scanPromise;
    this.scanPromise = this.scan();
    return this.scanPromise;
  }

  private async scan(): Promise<void> {
    const root = path.join(process.cwd(), 'skills');
    let entries: string[] = [];
    try {
      entries = await fs.readdir(root, { withFileTypes: true })
        .then(dirs => dirs.filter(d => d.isDirectory()).map(d => d.name));
    } catch {
      registryLogger.warn('skills/ directory not found; registry is empty', { root });
      this.scanned = true;
      return;
    }

    for (const id of entries) {
      const folder = path.join(root, id);
      try {
        const skill = await this.readSkill(id, folder);
        if (skill) this.skills.set(id, skill);
      } catch (err) {
        registryLogger.warn(`Skipping skill folder: ${id}`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    registryLogger.info(`Skill registry loaded ${this.skills.size} skills`);
    this.scanned = true;
  }

  private async readSkill(id: string, folder: string): Promise<SkillDefinition | null> {
    const mdPath = path.join(folder, 'SKILL.md');
    let content = '';
    try {
      content = await fs.readFile(mdPath, 'utf8');
    } catch {
      // A folder without SKILL.md is ignored unless it's executable.
      if (!(await this.hasExecutable(folder))) return null;
    }

    const meta: ParsedFrontmatter = content ? parseFrontmatter(content) : {};
    const body = (content || '').replace(/^---[\s\S]*?---\s*/, '');

    const name = (typeof meta.name === 'string' && meta.name.trim())
      ? meta.name.trim()
      : id;

    // Description: prefer clean frontmatter; fall back to body text.
    let description = typeof meta.description === 'string' ? meta.description.trim() : '';
    if (description.length < 5 || /[\uFFFD]/.test(description)) {
      description = extractBodyDescription(body);
    }
    if (description.length < 5) description = `${name} skill`;

    const tags = this.asStringArray(getPath(meta, 'metadata.tags'))
      .concat(this.asStringArray(meta.tags));
    const keywords = this.inferKeywords(name, tags, description);
    const executable = await this.hasExecutable(folder);

    return {
      id,
      path: folder,
      name,
      description: description.slice(0, 300),
      keywords,
      tags: [...new Set(tags)].slice(0, 20),
      capabilities: this.inferCapabilities(name, tags),
      dependencies: this.asStringArray(getPath(meta, 'requires.bins')),
      examples: this.asStringArray(getPath(meta, 'examples')),
      priority: typeof meta.priority === 'number' ? meta.priority : (executable ? 2 : 3),
      executable,
      license: typeof meta.license === 'string' ? meta.license : undefined,
      author: typeof getPath(meta, 'metadata.author') === 'string'
        ? String(getPath(meta, 'metadata.author'))
        : undefined,
      version: typeof getPath(meta, 'metadata.version') === 'string'
        ? String(getPath(meta, 'metadata.version'))
        : undefined,
    };
  }

  private asStringArray(value: unknown): string[] {
    if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
    if (typeof value === 'string') return value.split(',').map(s => s.trim()).filter(Boolean);
    return [];
  }

  private inferKeywords(name: string, tags: string[], description: string): string[] {
    const base = KEYWORD_HINTS[name] || [];
    const fromTags = tags.flatMap(t => t.split(/\s+/));
    const fromDesc = (description.match(/\b[a-z][a-z-]{3,20}\b/g) || []).slice(0, 12);
    return [...new Set([name, ...base, ...fromTags, ...fromDesc])].slice(0, 30);
  }

  private inferCapabilities(name: string, tags: string[]): string[] {
    const capTags = tags.filter(t => !['metadata', 'clawdbot', 'requires'].includes(t));
    const base = name.replace(/-/g, ' ');
    return [...new Set([base, ...capTags])].slice(0, 10);
  }

  private async hasExecutable(folder: string): Promise<boolean> {
    try {
      const entries = await fs.readdir(folder, { withFileTypes: true });
      if (entries.some(e => e.isDirectory() && e.name === 'scripts')) return true;
      return entries.some(e => e.isFile() && /\.(ts|js|py|sh)$/i.test(e.name));
    } catch {
      return false;
    }
  }

  /* ─── queries ─── */

  async getAll(): Promise<SkillDefinition[]> {
    await this.init();
    return [...this.skills.values()].sort((a, b) => a.priority - b.priority);
  }

  async get(id: string): Promise<SkillDefinition | undefined> {
    await this.init();
    return this.skills.get(id);
  }

  async search(query: string, limit = 8): Promise<SkillDefinition[]> {
    await this.init();
    const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    const scored: Array<{ skill: SkillDefinition; score: number }> = [];

    for (const skill of this.skills.values()) {
      const haystack = [
        skill.name, skill.description, ...skill.keywords, ...skill.tags,
      ].join(' ').toLowerCase();
      let score = 0;
      for (const term of terms) {
        if (haystack.includes(term)) score += 1;
        if (skill.keywords.some(k => k.includes(term))) score += 0.5;
      }
      if (skill.priority === 1) score += 0.4;
      if (score > 0) scored.push({ skill, score });
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => s.skill);
  }

  /** Map an agent id to a skills/ folder id when one exists. */
  async agentToSkill(agentId: string): Promise<string | undefined> {
    await this.init();
    const direct = this.skills.get(agentId);
    if (direct) return agentId;
    const alias = agentId.replace(/^-agent$/, '');
    for (const [id, skill] of this.skills) {
      if (skill.name.replace(/\s+/g, '-').toLowerCase() === alias) return id;
      if (skill.keywords.includes(agentId)) return id;
    }
    return undefined;
  }
}

export const dynamicSkillRegistry = new DynamicSkillRegistry();
