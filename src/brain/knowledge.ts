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

    const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 3);
    const scored = doc.chunks
      .map((chunk) => {
        const c = chunk.content.toLowerCase();
        const hits = terms.filter((t) => c.includes(t)).length;
        return { chunk, score: terms.length ? hits / terms.length : 0 };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    if (scored.length === 0) return returnRawHead(doc.content, 1500);
    return `Relevant excerpt from "${doc.title}":\n${scored.map((s) => s.chunk.content).join('\n...\n')}`;
  } catch (err) {
    knowledgeLogger.error('Document grounding failed', err);
    return '';
  }
}

function returnRawHead(content: string | null, max?: number): string {
  if (!content) return '';
  return content.slice(0, max ?? 1500);
}

export { MAX_CONTEXT_CHARS, TEXT_FILE_TYPES };