import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthenticatedUser, unauthorized } from '@/lib/auth';
import { orchestrator } from '@/lib/core/orchestrator';
import { ragPipeline } from '@/lib/rag/pipeline';
import { fireTaskWebhook } from '@/lib/services/zapier';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { content, source, sourceType = 'unknown', query, action = 'analyze' } = body;

    if (!content && !query) {
      return NextResponse.json({ error: 'Provide content or a query.' }, { status: 400 });
    }

    await orchestrator.init().catch(e => console.warn('[document] orchestrator init failed:', e));

    if (action === 'chunk' && content) {
      const chunks = await ragPipeline.chunkDocument(content, source || 'unknown', sourceType as any);
      return NextResponse.json({
        chunks: chunks.map(c => ({
          id: c.id,
          content: c.content.slice(0, 200) + '...',
          metadata: c.metadata,
        })),
        totalChunks: chunks.length,
      });
    }

    if (action === 'analyze' && content) {
      const response = await orchestrator.route({
        messages: [
          { role: 'system', content: `You are a document analyst. Analyze this document thoroughly.

Provide:
1. Document type and purpose
2. Key information extracted (dates, names, figures, decisions)
3. Main themes and arguments
4. Quality assessment
5. Notable patterns or anomalies
6. Action items (if any)
7. Questions the document raises

Be specific. Reference the document content.` },
          { role: 'user', content: content.slice(0, 50000) },
        ],
        taskCategory: 'document',
        thinking: true,
      });

      fireTaskWebhook('document', {
        userMessage: `Analyze document: ${(source || 'unknown').slice(0, 200)}`,
        aiResponse: response.content,
        service: 'document',
        timestamp: new Date().toISOString(),
        metadata: { modelUsed: response.modelId, action: 'analyze' },
      });

      return NextResponse.json({
        analysis: response.content,
        modelUsed: response.modelId,
        timestamp: Date.now(),
      });
    }

    if (query) {
      const response = await orchestrator.route({
        messages: [
          { role: 'system', content: 'Answer the question based on the provided document context. Cite specific parts of the document. If the document does not contain relevant information, say so.' },
          { role: 'user', content: `Document: ${(content || '').slice(0, 50000)}\n\nQuestion: ${query}` },
        ],
        taskCategory: 'document',
      });

      fireTaskWebhook('document', {
        userMessage: query,
        aiResponse: response.content,
        service: 'document',
        timestamp: new Date().toISOString(),
        metadata: { modelUsed: response.modelId, action: 'query' },
      });

      return NextResponse.json({
        answer: response.content,
        modelUsed: response.modelId,
        timestamp: Date.now(),
      });
    }

    return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
  } catch (error) {
    console.error('Document API error:', error);
    return NextResponse.json({ error: 'Document processing failed.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Provide document id.' }, { status: 400 });

  const doc = await db.document.findUnique({ where: { id } });
  if (!doc || doc.userId !== user.id) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  await db.documentChunk.deleteMany({ where: { documentId: id } });
  await db.document.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
}
