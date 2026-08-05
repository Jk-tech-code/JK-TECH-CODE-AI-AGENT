import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthenticatedUser, unauthorized } from '@/lib/auth';
import { ragPipeline } from '@/lib/rag/pipeline';

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
    const decoded = buffer.toString('utf-8');
    // Binary formats (PDF, DOCX, XLSX, PPTX, images, …) do not survive a naive
    // UTF-8 decode — the result is replacement characters and control bytes.
    // Storing that garbage would poison the model's context and produce
    // nonsensical replies, so store empty content for binary files instead.
    // The stream route then tells the model the file was uploaded but its
    // contents couldn't be extracted automatically.
    const content = looksBinary(decoded) ? '' : decoded.slice(0, 100000);
    const documentName = file.name || `upload-${Date.now()}`;

    const doc = await db.document.create({
      data: {
        userId: user.id,
        title: documentName,
        content: content.slice(0, 100000),
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
          'unknown',
          { title: documentName }
        )
      : [];

    if (chunks.length > 0) {
      await db.documentChunk.createMany({
        data: chunks.map(c => ({
          documentId: doc.id,
          content: c.content,
          chunkIndex: c.metadata.chunkIndex,
          metadata: JSON.stringify(c.metadata),
        })),
      });
    }

    return NextResponse.json({
      id: doc.id,
      title: doc.title,
      fileType: doc.fileType,
      fileSize: doc.fileSize,
      chunksCreated: chunks.length,
      createdAt: doc.createdAt,
    });
  } catch (error) {
    console.error('Upload error:', error);
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
