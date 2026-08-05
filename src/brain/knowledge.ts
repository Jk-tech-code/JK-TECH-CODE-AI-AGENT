/**
 * Brain Knowledge — turns uploaded documents into grounded context.
 *
 * Supports PDF, DOCX, PPTX, XLSX, CSV, TXT, Markdown, images and source code.
 * Text-based files are already stored (extracted + chunked) by the upload route;
 * this module retrieves and formats that content into the prompt context before
 * the model is called. Binary/office files that couldn't be auto-extracted are
 * acknowledged honestly rather than hallucinated.
 */
import { db } from '@/lib/db';
import { createLogger } from '@/lib/logging/logger';
import { embeddingProvider } from '@/lib/rag/embedding';
import { securityGuard } from '@/lib/security/guard';

const knowledgeLogger = createLogger('brain:knowledge');

export interface FileContext {
  fileId: string;
  title: string;
  fileType: string;
  content: string;
  sources: string[];
}

const MAX_CONTEXT_CHARS = 6000;
const TEXT_FILE_TYPES = new Set(['txt', 'csv', 'json', 'md', 'markdown']);

/**
 * Build a context block describing the user's uploaded files. Only includes
 * files owned by the current user.
 */
export async function buildFileContext(
  attachments: Array<{ id: string; fileType?: string; title?: string }> | undefined,
  userId: string | undefined,
): Promise<string> {
  if (!attachments || attachments.length === 0) return '';

  const parts: string[] = [];
  let budget = MAX_CONTEXT_CHARS;

  for (const att of attachments.slice(0, 8)) {
    try {
      const doc = await db.document.findUnique({ where: { id: att.id } });
      if (!doc || (userId && doc.userId !== userId)) {
        parts.push(`- An attached file was not found.`);
        continue;
      }
      const fileType = (doc.fileType || att.fileType || '').toLowerCase();
      const title = doc.title || att.title || att.id;

      // Images: describe the file so the model treats it as visible context.
      if (['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif', 'bmp', 'avif', 'heic', 'tiff'].includes(fileType)) {
        parts.push(`- [Image attached: ${title} (${fileType})]`);
        continue;
      }

      // Office/binary file with no extracted text — acknowledge, don't invent.
      if (!doc.content || !doc.content.trim()) {
        parts.push(
          `- [Attached file: ${title} (${fileType})] — its contents couldn't be read automatically. Ask what the user wants to do with it.`,
        );
        continue;
      }

      let content = doc.content.trim();
      // Heuristic: don't dump raw "binary-decoded" garbage.
      if (!TEXT_FILE_TYPES.has(fileType) && !/^[\w\s.,;:'"!?\-()\[\]{}#@%$&\*+\/\\=\n\r<>~`|]+$/u.test(content.slice(0, 500))) {
        parts.push(`- [Attached file: ${title} (${fileType})] — contents couldn't be extracted cleanly.`);
        continue;
      }

      // Guard against RAG poisoning: document content must never be able to
      // override the assistant's instructions.
      if (securityGuard.analyzeRagSource(content.slice(0, 4000)).isSafe === false) {
        parts.push(`- [Attached file: ${title} — content withheld for safety.]`);
        continue;
      }

      if (content.length > budget) content = content.slice(0, budget);
      budget -= content.length;
      parts.push(`Attached file: ${title}\n--- BEGIN CONTENT ---\n${content}\n--- END CONTENT ---`);
    } catch (err) {
      knowledgeLogger.error('Failed to load attachment context', err);
      parts.push(`- [Attached file: ${att.title || att.id} — could not be read.]`);
    }
  }

  return parts.length > 0 ? `\n\nThe user uploaded the following file(s) — use them to answer:\n\n${parts.join('\n\n')}` : '';
}

/**
 * Retrieve relevant chunks from a specific stored document for RAG-style
 * grounding (used when the user references their own uploaded documents).
 *
 * Uses stored vector embeddings when available (fast, accurate); otherwise
 * falls back to keyword-overlap scoring over the document's chunks.
 */
export async function retrieveDocumentGrounding(
  fileId: string,
  query: string,
  userId?: string,
  topK = 3,
): Promise<string> {
  try {
    const doc = await db.document.findUnique({
      where: { id: fileId },
      include: { chunks: { orderBy: { chunkIndex: 'asc' }, take: 200 } },
    });
    if (!doc || (userId && doc.userId !== userId)) return '';

    const top = await rankChunks(doc.chunks, query, topK);
    if (top.length === 0) return returnRawHead(doc.content, 1500);
    return `Relevant excerpt from "${doc.title}":\n${top.join('\n...\n')}`;
  } catch (err) {
    knowledgeLogger.error('Document grounding failed', err);
    return '';
  }
}

function cosine(a: number[], b: number[]): number {
  if (!a || !b || a.length === 0 || a.length !== b.length) return 0;
  let dot = 0, ma = 0, mb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    ma += a[i] * a[i];
    mb += b[i] * b[i];
  }
  const denom = Math.sqrt(ma) * Math.sqrt(mb);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Rank a list of stored chunks against a query. Prefers vector embeddings when
 * they are persisted; blends in keyword overlap to stay robust for short/odd
 * queries and for the deterministic fallback embedding provider.
 */
async function rankChunks(
  chunks: Array<{ content: string; embedding: string | null }>,
  query: string,
  topK: number,
): Promise<string[]> {
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 3);
  if (chunks.length === 0) return [];

  const useVectors = chunks.some((c) => c.embedding);
  let queryEmbedding: number[] | null = null;
  if (useVectors && embeddingProvider.name !== 'fallback') {
    try {
      queryEmbedding = await embeddingProvider.embed(query);
    } catch {
      queryEmbedding = null;
    }
  }

  const scored = chunks
    .map((chunk) => {
      const content = chunk.content.toLowerCase();
      const hits = terms.filter((t) => content.includes(t)).length;
      const termScore = terms.length ? hits / terms.length : 0;

      let vectorScore = 0;
      if (queryEmbedding && chunk.embedding) {
        try {
          vectorScore = cosine(queryEmbedding, JSON.parse(chunk.embedding) as number[]);
        } catch {
          vectorScore = 0;
        }
      }

      // Weight vector similarity higher when it's real; fall back to terms.
      const score = queryEmbedding ? vectorScore * 0.7 + termScore * 0.3 : termScore;
      return { content: chunk.content, score };
    })
    .filter((s) => s.score > 0)
    // RAG poisoning guard: never let retrieved document text act as instructions.
    .filter((s) => securityGuard.analyzeRagSource(s.content.slice(0, 4000)).isSafe)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored.map((s) => s.content);
}

/**
 * Search all of a user's uploaded documents for chunks relevant to a query
 * and return them as compact context. Used to ground answers in the user's own
 * knowledge base without dumping whole files into the prompt.
 */
export async function retrieveKnowledgeForQuery(
  userId: string | undefined,
  query: string,
  topK = 3,
  maxDocs = 5,
): Promise<string> {
  if (!userId) return '';
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 3);
  if (terms.length === 0) return '';

  try {
    const docs = await db.document.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: { id: true, title: true, content: true },
    });
    if (docs.length === 0) return '';

    // Prefer docs whose title/metadata mention the query terms, then fall back
    // to the most recently updated set so we stay fast and bounded.
    const rankedDocs = docs
      .map((d) => ({
        doc: d,
        score: terms.filter((t) => `${d.title}`.toLowerCase().includes(t)).length,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, maxDocs);

    const excerpts: string[] = [];
    for (const { doc } of rankedDocs) {
      const chunks = await db.documentChunk.findMany({
        where: { documentId: doc.id },
        orderBy: { chunkIndex: 'asc' },
        take: 200,
        select: { content: true, embedding: true },
      });
      const top = await rankChunks(chunks, query, 2);
      for (const t of top) excerpts.push(`[${doc.title}]\n${t}`);
    }

    if (excerpts.length === 0) {
      // Fall back to the head of the best-matching document.
      const best = rankedDocs[0]?.doc;
      if (best?.content) return `[${best.title}]\n${returnRawHead(best.content, 1200)}`;
    }
    return excerpts.slice(0, topK).join('\n\n');
  } catch (err) {
    knowledgeLogger.error('Knowledge retrieval failed', err);
    return '';
  }
}

function returnRawHead(content: string | null, max?: number): string {
  if (!content) return '';
  return content.slice(0, max ?? 1500);
}

export { MAX_CONTEXT_CHARS, TEXT_FILE_TYPES };