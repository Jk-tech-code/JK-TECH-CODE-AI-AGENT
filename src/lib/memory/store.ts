import type { MemoryEntry, MemoryType } from '../core/types';

interface MemoryStoreOptions {
  maxShortTermItems: number;
  defaultTtlMs: number;
  decayRate: number;
}

export class MemoryStore {
  private shortTerm: Map<string, MemoryEntry> = new Map();
  private longTerm: Map<string, MemoryEntry> = new Map();
  private projectMemory: Map<string, Map<string, MemoryEntry>> = new Map();
  private conversationMemory: Map<string, MemoryEntry[]> = new Map();
  private knowledgeGraph: Map<string, Set<string>> = new Map();
  private options: MemoryStoreOptions;

  constructor(options?: Partial<MemoryStoreOptions>) {
    this.options = {
      maxShortTermItems: 100,
      defaultTtlMs: 3600000,
      decayRate: 0.1,
      ...options,
    };

    setInterval(() => this.runDecay(), 300000);
  }

  async store(entry: Omit<MemoryEntry, 'id' | 'timestamp' | 'lastAccessed' | 'accessCount'>): Promise<string> {
    const id = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const full: MemoryEntry = {
      ...entry,
      id,
      timestamp: Date.now(),
      lastAccessed: Date.now(),
      accessCount: 0,
    };

    switch (entry.type) {
      case 'conversation':
        this.storeConversation(full);
        break;
      case 'project':
        this.storeProject(full);
        break;
      case 'preference':
        this.longTerm.set(id, full);
        break;
      case 'knowledge':
      case 'fact':
        this.storeKnowledge(full);
        break;
      case 'session':
      default:
        this.storeShortTerm(full);
        break;
    }

    return id;
  }

  private storeShortTerm(entry: MemoryEntry): void {
    if (this.shortTerm.size >= this.options.maxShortTermItems) {
      const oldest = [...this.shortTerm.entries()]
        .sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed)[0];
      if (oldest) this.shortTerm.delete(oldest[0]);
    }
    this.shortTerm.set(entry.id, entry);
  }

  private storeConversation(entry: MemoryEntry): void {
    const tag = entry.tags.find(t => t.startsWith('conv:')) || 'conv:default';
    const convId = tag.replace('conv:', '');
    if (!this.conversationMemory.has(convId)) {
      this.conversationMemory.set(convId, []);
    }
    this.conversationMemory.get(convId)!.push(entry);

    if (this.conversationMemory.get(convId)!.length > 50) {
      this.conversationMemory.get(convId)!.shift();
    }
  }

  private storeProject(entry: MemoryEntry): void {
    const tag = entry.tags.find(t => t.startsWith('proj:')) || 'proj:default';
    const projId = tag.replace('proj:', '');
    if (!this.projectMemory.has(projId)) {
      this.projectMemory.set(projId, new Map());
    }
    this.projectMemory.get(projId)!.set(entry.id, entry);
  }

  private storeKnowledge(entry: MemoryEntry): void {
    this.longTerm.set(entry.id, entry);

    for (const tag of entry.tags) {
      if (!this.knowledgeGraph.has(tag)) {
        this.knowledgeGraph.set(tag, new Set());
      }
      this.knowledgeGraph.get(tag)!.add(entry.id);
    }
  }

  async recall(query: string, options?: {
    type?: MemoryType;
    tags?: string[];
    limit?: number;
    minRelevance?: number;
  }): Promise<MemoryEntry[]> {
    const results: Array<{ entry: MemoryEntry; score: number }> = [];
    const queryTerms = query.toLowerCase().split(' ').filter(t => t.length > 2);

    const sources = this.getAllRelevantSources(options);

    for (const entry of sources) {
      let score = 0;
      const content = entry.content.toLowerCase();

      const termMatches = queryTerms.filter(t => content.includes(t)).length;
      score += (termMatches / Math.max(queryTerms.length, 1)) * 0.5;

      const recency = Math.max(0, 1 - (Date.now() - entry.timestamp) / 86400000);
      score += recency * 0.2;

      const frequency = Math.min(1, entry.accessCount / 10);
      score += frequency * 0.15;

      const tagOverlap = options?.tags?.filter(t => entry.tags.includes(t)).length || 0;
      if (options?.tags && options.tags.length > 0) {
        score += (tagOverlap / options.tags.length) * 0.15;
      }

      if (score > (options?.minRelevance ?? 0.05)) {
        results.push({ entry, score });
      }
    }

    results.sort((a, b) => b.score - a.score);

    const top = results.slice(0, options?.limit ?? 10);

    for (const r of top) {
      r.entry.accessCount++;
      r.entry.lastAccessed = Date.now();
    }

    return top.map(r => r.entry);
  }

  async getConversationHistory(conversationId: string, limit = 20): Promise<MemoryEntry[]> {
    const entries = this.conversationMemory.get(conversationId) || [];
    return entries.slice(-limit);
  }

  async getProjectMemory(projectId: string): Promise<MemoryEntry[]> {
    const project = this.projectMemory.get(projectId);
    return project ? [...project.values()] : [];
  }

  private getAllRelevantSources(options?: { type?: MemoryType }): MemoryEntry[] {
    const sources: MemoryEntry[] = [];

    for (const entry of this.shortTerm.values()) {
      if (!options?.type || entry.type === options.type) sources.push(entry);
    }
    for (const entry of this.longTerm.values()) {
      if (!options?.type || entry.type === options.type) sources.push(entry);
    }
    for (const proj of this.projectMemory.values()) {
      for (const entry of proj.values()) {
        if (!options?.type || entry.type === options.type) sources.push(entry);
      }
    }

    return sources;
  }

  async forget(id: string): Promise<boolean> {
    return this.shortTerm.delete(id) || this.longTerm.delete(id);
  }

  async clearConversation(conversationId: string): Promise<void> {
    this.conversationMemory.delete(conversationId);
  }

  async decay(entryId: string): Promise<void> {
    const entry = this.shortTerm.get(entryId) || this.longTerm.get(entryId);
    if (!entry) return;

    if (entry.ttl && Date.now() - entry.timestamp > entry.ttl) {
      this.shortTerm.delete(entryId);
      this.longTerm.delete(entryId);
      return;
    }
  }

  private runDecay(): void {
    const now = Date.now();
    const toRemove: string[] = [];

    for (const [id, entry] of this.shortTerm) {
      if (entry.ttl && now - entry.timestamp > entry.ttl) {
        toRemove.push(id);
      }
    }

    for (const id of toRemove) {
      this.shortTerm.delete(id);
    }
  }

  async getStats(): Promise<{
    shortTermCount: number;
    longTermCount: number;
    conversationCount: number;
    projectCount: number;
    knowledgeTags: number;
  }> {
    return {
      shortTermCount: this.shortTerm.size,
      longTermCount: this.longTerm.size,
      conversationCount: this.conversationMemory.size,
      projectCount: this.projectMemory.size,
      knowledgeTags: this.knowledgeGraph.size,
    };
  }
}

export const memoryStore = new MemoryStore();
