import { createLogger } from '@/lib/logging/logger';

const embedLogger = createLogger('embedding');

export interface EmbeddingProvider {
  name: string;
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  dimensions: number;
}

class OpenAIEmbeddingProvider implements EmbeddingProvider {
  name = 'openai';
  dimensions = 1536;
  private apiKey: string;
  private model: string;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || '';
    this.model = 'text-embedding-3-small';
  }

  async embed(text: string): Promise<number[]> {
    const [result] = await this.embedBatch([text]);
    return result;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!this.apiKey) throw new Error('OPENAI_API_KEY not configured');

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input: texts, model: this.model }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI embedding failed: ${err}`);
    }

    const data = await response.json();
    return data.data.sort((a: any, b: any) => a.index - b.index).map((d: any) => d.embedding);
  }
}

class VoyageEmbeddingProvider implements EmbeddingProvider {
  name = 'voyage';
  dimensions = 1024;
  private apiKey: string;
  private model: string;

  constructor() {
    this.apiKey = process.env.VOYAGE_API_KEY || '';
    this.model = 'voyage-2';
  }

  async embed(text: string): Promise<number[]> {
    const [result] = await this.embedBatch([text]);
    return result;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!this.apiKey) throw new Error('VOYAGE_API_KEY not configured');

    const response = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input: texts, model: this.model }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Voyage embedding failed: ${err}`);
    }

    const data = await response.json();
    return data.data.sort((a: any, b: any) => a.index - b.index).map((d: any) => d.embedding);
  }
}

class CohereEmbeddingProvider implements EmbeddingProvider {
  name = 'cohere';
  dimensions = 1024;
  private apiKey: string;
  private model: string;

  constructor() {
    this.apiKey = process.env.COHERE_API_KEY || '';
    this.model = 'embed-english-v3.0';
  }

  async embed(text: string): Promise<number[]> {
    const [result] = await this.embedBatch([text]);
    return result;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!this.apiKey) throw new Error('COHERE_API_KEY not configured');

    const response = await fetch('https://api.cohere.com/v2/embed', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        texts,
        model: this.model,
        input_type: 'search_document',
        embedding_types: ['float'],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Cohere embedding failed: ${err}`);
    }

    const data = await response.json();
    return data.embeddings.float || data.embeddings;
  }
}

class GeminiEmbeddingProvider implements EmbeddingProvider {
  name = 'gemini';
  dimensions = 768;
  private apiKey: string;
  private model: string;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || '';
    this.model = 'text-embedding-004';
  }

  async embed(text: string): Promise<number[]> {
    const [result] = await this.embedBatch([text]);
    return result;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!this.apiKey) throw new Error('GEMINI_API_KEY not configured');

    const results: number[][] = [];
    for (const text of texts) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:embedContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: { parts: [{ text }] } }),
        },
      );

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Gemini embedding failed: ${err}`);
      }

      const data = await response.json();
      results.push(data.embedding.values);
    }

    return results;
  }
}

class FallbackEmbeddingProvider implements EmbeddingProvider {
  name = 'fallback';
  dimensions = 384;

  async embed(text: string): Promise<number[]> {
    const seed = text.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const rng = this.seededRandom(seed);
    return Array.from({ length: this.dimensions }, () => rng() * 2 - 1);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map(t => this.embed(t)));
  }

  private seededRandom(seed: number): () => number {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }
}

export function createEmbeddingProvider(): EmbeddingProvider {
  const provider = (process.env.EMBEDDING_PROVIDER || 'fallback').toLowerCase();

  switch (provider) {
    case 'openai':
      if (process.env.OPENAI_API_KEY) return new OpenAIEmbeddingProvider();
      embedLogger.warn('OPENAI_API_KEY not set, falling back to deterministic embeddings');
      return new FallbackEmbeddingProvider();
    case 'voyage':
      if (process.env.VOYAGE_API_KEY) return new VoyageEmbeddingProvider();
      embedLogger.warn('VOYAGE_API_KEY not set, falling back to deterministic embeddings');
      return new FallbackEmbeddingProvider();
    case 'cohere':
      if (process.env.COHERE_API_KEY) return new CohereEmbeddingProvider();
      embedLogger.warn('COHERE_API_KEY not set, falling back to deterministic embeddings');
      return new FallbackEmbeddingProvider();
    case 'gemini':
      if (process.env.GEMINI_API_KEY) return new GeminiEmbeddingProvider();
      embedLogger.warn('GEMINI_API_KEY not set, falling back to deterministic embeddings');
      return new FallbackEmbeddingProvider();
    default:
      embedLogger.info('No embedding provider configured, using deterministic embeddings');
      return new FallbackEmbeddingProvider();
  }
}

export const embeddingProvider = createEmbeddingProvider();
