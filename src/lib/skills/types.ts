/** Skill plugin metadata. Mirrors the frontmatter found in skill SKILL.md files. */
export interface SkillDefinition {
  /** Folder name = unique skill id. */
  id: string;
  /** Path to the skill folder (relative to repo root). */
  path: string;
  name: string;
  description: string;
  keywords: string[];
  tags: string[];
  capabilities: string[];
  dependencies: string[];
  examples: string[];
  priority: number;
  /** True when an executable entry point was discovered (scripts/, .ts/.js files). */
  executable: boolean;
  /** Optional license from frontmatter. */
  license?: string;
  /** YAML author if present. */
  author?: string;
  /** Version if present. */
  version?: string;
}

/** Execution interface a skill can optionally expose (plugin contract). */
export interface SkillPlugin {
  definition: SkillDefinition;
  run?(input: string, context?: Record<string, unknown>): Promise<{ result: string; metadata?: Record<string, unknown> }>;
}

export type SkillCategory =
  | 'writing'
  | 'coding'
  | 'research'
  | 'design'
  | 'document'
  | 'data'
  | 'marketing'
  | 'career'
  | 'media'
  | 'education'
  | 'analysis'
  | 'general';
