import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthenticatedUser, unauthorized } from '@/lib/auth';
import { ragPipeline } from '@/lib/rag/pipeline';
import { extractFileText } from '@/lib/rag/extract';
import { createLogger } from '@/lib/logging/logger';

const uploadLogger = createLogger('api:upload');
const MAX_FILE_SIZE = 50 * 1024 * 1024;

/**
 * Heuristic check for content that is not valid UTF-8 text (binary files
 * decoded naively). Looks for replacement characters, NUL bytes and control
 * characters in the first few KB.
 */
function looksBinary(text: string): boolean {
  if (!text) return true;
  const sample = text.slice(0, 4096);
  let suspicious = 0;
  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i);
    // U+FFFD replacement char, NUL, low control chars, C1 controls
    if (code === 0xfffd || code === 0 || code < 9 || (code > 127 && code < 160)) {
      suspicious++;
    }
  }
  return suspicious > sample.length * 0.1;
}
const ALLOWED_TYPES = {
  'text/plain': 'txt',
  'text/csv': 'csv',
  'application/json': 'json',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large (max 50MB).' }, { status: 400 });
    }

    const fileType = ALLOWED_TYPES[file.type as keyof typeof ALLOWED_TYPES];
    if (!fileType) {
      return NextResponse.json({ error: `Unsupported file type: ${file.type}` }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Extract text: real parsers for PDF/DOCX/XLSX, raw UTF-8 decode for text
    // formats. Extraction failures produce empty content (acknowledged later by
    // the Brain instead of hallucinated).
    const extracted = await extractFileText(buffer, file.type);
    let content = extracted.content;
    const looksTextLike = !looksBinary(content);
    if (!looksTextLike) content = '';
    content = content.slice(0, 100000);
    const documentName = file.name || `upload-${Date.now()}`;

    const doc = await db.document.create({
      data: {
        userId: user.id,
        title: documentName,
        content,
        sourceType: fileType,
        fileType,
        fileSize: file.size,
        source: documentName,
      },
    });

    const chunks = content
      ? await ragPipeline.chunkDocument(
          content.slice(0, 100000),
          documentName,
          fileType as 'unknown',
          { title: documentName }
        )
      : [];

    // Persist embeddings when a real embedding provider is available so chunk
    // retrieval is vector-based; the fallback provider is skipped to avoid
    // persisting meaningless pseudo-embeddings.
    let embeddingsPersisted = 0;
    if (chunks.length > 0) {
      let hasRealProvider = true;
      try {
        const { embeddingProvider } = await import('@/lib/rag/embedding');
        hasRealProvider = embeddingProvider.name !== 'fallback';
      } catch {
        hasRealProvider = false;
      }

      const rows = chunks.map(c => ({
        documentId: doc.id,
        content: c.content,
        chunkIndex: c.metadata.chunkIndex,
        metadata: JSON.stringify(c.metadata),
        embedding: null as string | null,
      }));

      if (hasRealProvider) {
        try {
          await ragPipeline.embedChunks(chunks);
          chunks.forEach((c, i) => {
            if (c.embedding && rows[i]) rows[i].embedding = JSON.stringify(c.embedding);
          });
          embeddingsPersisted = rows.filter((r) => r.embedding).length;
        } catch (err) {
          uploadLogger.warn('Embedding computation failed; storing text chunks only', { documentId: doc.id });
          uploadLogger.error('Embedding error', err);
        }
      }

      await db.documentChunk.createMany({
        data: rows.map((r) => ({
          documentId: r.documentId,
          content: r.content,
          chunkIndex: r.chunkIndex,
          metadata: r.metadata,
          embedding: r.embedding,
        })),
      });
    }

    uploadLogger.info('Upload processed', {
      documentId: doc.id,
      fileType,
      chunks: chunks.length,
      embeddings: embeddingsPersisted,
      extractedBy: extracted.extractedBy,
      pageCount: extracted.pageCount,
    });

    return NextResponse.json({
      id: doc.id,
      title: doc.title,
      fileType: doc.fileType,
      fileSize: doc.fileSize,
      chunksCreated: chunks.length,
      embeddingsPersisted,
      createdAt: doc.createdAt,
    });
  } catch (error) {
    uploadLogger.error('Upload error', error);
    return NextResponse.json({ error: 'Upload failed.' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (id) {
    const doc = await db.document.findUnique({
      where: { id },
      include: { _count: { select: { chunks: true } } },
    });

    if (!doc || doc.userId !== user.id) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    return NextResponse.json({
      id: doc.id,
      title: doc.title,
      content: doc.content,
      fileType: doc.fileType,
      fileSize: doc.fileSize,
      chunks: doc._count.chunks,
      createdAt: doc.createdAt,
    });
  }

  const documents = await db.document.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      title: true,
      fileType: true,
      fileSize: true,
      sourceType: true,
      createdAt: true,
      _count: { select: { chunks: true } },
    },
  });

  return NextResponse.json({ documents });
}
