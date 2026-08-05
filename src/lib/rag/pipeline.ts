import type { RagChunk, RagMetadata, RagQuery, RagResult, SourceType } from '../core/types';
import crypto from 'crypto';
import { embeddingProvider } from './embedding';

interface ChunkOptions {
  chunkSize: number;
  chunkOverlap: number;
  separators: string[];
}

export class RagPipeline {
  private chunkOptions: ChunkOptions = {
    chunkSize: 1000,
    chunkOverlap: 200,
    separators: ['\n\n', '\n', '. ', ' ', ''],
  };

  async chunkDocument(
    content: string,
    source: string,
    sourceType: SourceType,
    metadata?: Partial<RagMetadata>
  ): Promise<RagChunk[]> {
    const chunks: RagChunk[] = [];
    const text = content.trim();
    if (!text) return chunks;

    const splitPoints = this.findSplitPoints(text, this.chunkOptions.chunkSize, this.chunkOptions.chunkOverlap);
    const totalChunks = splitPoints.length;

    for (let i = 0; i < splitPoints.length; i++) {
      const start = splitPoints[i].start;
      const end = splitPoints[i].end;
      const chunkContent = text.slice(start, end).trim();
      if (!chunkContent) continue;

      chunks.push({
        id: crypto.createHash('md5').update(`${source}-${i}-${chunkContent.slice(0, 50)}`).digest('hex'),
        content: chunkContent,
        metadata: {
          source,
          sourceType,
          title: metadata?.title,
          author: metadata?.author,
          date: metadata?.date,
          pageNumber: metadata?.pageNumber,
          chunkIndex: i,
          totalChunks,
          hash: crypto.createHash('sha256').update(chunkContent).digest('hex').slice(0, 16),
          ...metadata,
        },
      });
    }

    return chunks;
  }

  private findSplitPoints(text: string, chunkSize: number, overlap: number): Array<{ start: number; end: number }> {
    const points: Array<{ start: number; end: number }> = [];
    let start = 0;

    while (start < text.length) {
      let end = Math.min(start + chunkSize, text.length);

      if (end < text.length) {
        end = this.findBestSplit(text, end, chunkSize * 0.8, chunkSize * 1.2);
      }

      points.push({ start, end });
      start = end - overlap;
      if (start >= text.length) break;
    }

    return points;
  }

  private findBestSplit(text: string, around: number, minLen: number, maxLen: number): number {
    for (const separator of this.chunkOptions.separators) {
      if (!separator) continue;
      let searchStart = Math.max(around - 100, 0);
      let searchEnd = Math.min(around + 100, text.length);
      let pos = text.lastIndexOf(separator, around);

      if (pos > searchStart && (pos - (around - (pos - searchStart))) > minLen) {
        return pos + separator.length;
      }

      pos = text.indexOf(separator, around);
      if (pos !== -1 && pos < searchEnd && (pos + separator.length - around) < maxLen - around) {
        return pos + separator.length;
      }
    }

    return Math.min(around, text.length);
  }

  async computeEmbedding(chunk: RagChunk): Promise<number[]> {
    return embeddingProvider.embed(chunk.content);
  }

  /** Compute and attach embeddings for a batch of chunks (in place). */
  async embedChunks(chunks: RagChunk[]): Promise<RagChunk[]> {
    if (chunks.length === 0) return chunks;
    const texts = chunks.map((c) => c.content);
    const vectors = await embeddingProvider.embedBatch(texts);
    chunks.forEach((c, i) => {
      if (vectors[i]) c.embedding = vectors[i];
    });
    return chunks;
  }

  async retrieve(query: RagQuery, chunks: RagChunk[]): Promise<RagResult> {
    const startTime = Date.now();
    const queryEmbedding = await this.computeTextEmbedding(query.query);

    const scored = chunks.map(chunk => ({
      chunk,
      score: this.cosineSimilarity(queryEmbedding, chunk.embedding || []),
    }));

    const filtered = scored
      .filter(s => s.score >= query.minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, query.topK);

    return {
      chunks: filtered.map(s => ({ ...s.chunk, score: s.score })),
      totalFound: filtered.length,
      queryTimeMs: Date.now() - startTime,
    };
  }

  async rerank(query: string, chunks: RagChunk[], topK: number): Promise<RagChunk[]> {
    const scored = chunks.map(chunk => {
      const queryTerms = query.toLowerCase().split(' ').filter(t => t.length > 2);
      const content = chunk.content.toLowerCase();
      const termMatches = queryTerms.filter(t => content.includes(t)).length;
      const termScore = queryTerms.length > 0 ? termMatches / queryTerms.length : 0;

      const positionScore = 1 - (chunk.metadata.chunkIndex / Math.max(chunk.metadata.totalChunks, 1));

      const finalScore = (chunk.score || 0) * 0.5 + termScore * 0.3 + positionScore * 0.2;

      return { ...chunk, score: finalScore };
    });

    return scored.sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, topK);
  }

  private async computeTextEmbedding(text: string): Promise<number[]> {
    return embeddingProvider.embed(text);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0;
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    const denom = Math.sqrt(magA) * Math.sqrt(magB);
    return denom === 0 ? 0 : dot / denom;
  }

  formatContext(chunks: RagChunk[], maxTokens = 4000): string {
    let context = '';
    for (const chunk of chunks) {
      const entry = `[Source: ${chunk.metadata.source}]
${chunk.content}

`;
      if ((context.length + entry.length) > maxTokens * 4) break;
      context += entry;
    }
    return context.trim();
  }
}

export const ragPipeline = new RagPipeline();
