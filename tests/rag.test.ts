import { describe, it, expect, vi } from 'vitest';

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => ({ body, status: init?.status || 200 }),
  },
}));

vi.mock('@/lib/logging/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: class MockPrisma {
    $connect = vi.fn();
    $disconnect = vi.fn();
  },
}));

import { ragPipeline } from '../src/lib/rag/pipeline';

describe('RAG Pipeline', () => {
  it('should chunk a document into multiple chunks', async () => {
    const content = 'First paragraph about AI technology.\n\nSecond paragraph about machine learning.\n\nThird paragraph about deep neural networks.\n\nFourth paragraph about training data.\n\nFifth paragraph about model deployment.';
    const chunks = await ragPipeline.chunkDocument(content, 'test-source', 'article');
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]).toHaveProperty('id');
    expect(chunks[0]).toHaveProperty('content');
    expect(chunks[0].metadata.source).toBe('test-source');
    expect(chunks[0].metadata.sourceType).toBe('article');
  });

  it('should return empty for empty content', async () => {
    const chunks = await ragPipeline.chunkDocument('', 'empty', 'article');
    expect(chunks.length).toBe(0);
  });

  it('should generate 384-dim embeddings', async () => {
    const content = 'Test content for embedding';
    const chunk = (await ragPipeline.chunkDocument(content, 'src', 'article'))[0];
    const emb = await ragPipeline.computeEmbedding(chunk);
    expect(emb.length).toBe(384);
    expect(emb.every(v => typeof v === 'number')).toBe(true);
  });

  it('should rerank chunks based on query relevance', async () => {
    const chunks = await ragPipeline.chunkDocument(
      'Python is great for AI development. JavaScript powers the web. Rust is fast and safe. Go is simple and concurrent. TypeScript adds types.',
      'languages',
      'article'
    );
    const reranked = await ragPipeline.rerank('programming languages', chunks, 3);
    expect(reranked.length).toBeLessThanOrEqual(3);
    expect(reranked.every(c => typeof c.score === 'number')).toBe(true);
  });

  it('should format context with source headers', async () => {
    const chunks = await ragPipeline.chunkDocument('Simple test content for formatting.', 'test', 'article');
    const context = ragPipeline.formatContext(chunks, 1000);
    expect(context).toContain('[Source: test]');
    expect(context).toContain('Simple test content');
  });

  it('should respect maxTokens limit in formatContext', async () => {
    const longContent = 'A B C D E F G H I J K L M N O P Q R S T U V W X Y Z ';
    const chunks = await ragPipeline.chunkDocument(longContent.repeat(20), 'long', 'article');
    const context = ragPipeline.formatContext(chunks, 5);
    expect(context.length).toBeLessThan(150);
  });
});
