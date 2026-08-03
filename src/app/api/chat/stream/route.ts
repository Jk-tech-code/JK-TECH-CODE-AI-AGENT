import { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { streamText, generateText } from 'ai';
import { getModel, DEFAULT_MODEL_ID } from '@/lib/ai/provider';
import { agentWorkflow } from '@/lib/core/workflow';
import { getAuthenticatedUser } from '@/lib/auth';
import { db } from '@/lib/db';

/**
 * POST /api/chat/stream
 *
 * Server-Sent Events streaming chat.
 * Shared setup (auth, security, search, memory, conversation loading)
 * is delegated to AgentWorkflow.prepareStream().
 * The LLM stream runs through the Vercel AI SDK (streamText).
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const { messages, query, conversationId, taskCategory, zapierEvent, zapierService } = body;

    if (!messages && !query) {
      return new Response(JSON.stringify({ error: 'Provide a message or query.' }), { status: 400 });
    }

    // Verify conversation ownership if conversationId is provided
    if (conversationId) {
      const user = await getAuthenticatedUser();
      if (!user) {
        return NextResponse.json(
          { error: 'Authentication required to continue conversations.' },
          { status: 401 },
        );
      }
      const conv = await db.conversation.findUnique({ where: { id: conversationId } });
      if (conv && conv.userId !== user.id) {
        return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
      }
    }

    const chatMessages: Array<{ role: string; content: string }> =
      messages && Array.isArray(messages) && messages.length > 0
        ? messages
        : query && typeof query === 'string'
          ? [{ role: 'user', content: query }]
          : [];

    const memoryEnabled = true;
    const persistenceEnabled = true;

    // Delegate all shared setup to the workflow
    const prep = await agentWorkflow.prepareStream({
      messages: chatMessages,
      query,
      conversationId,
      taskCategory: taskCategory || 'general',
      zapierEvent,
      zapierService,
      thinking: true,
      searchEnabled: true,
      memoryEnabled,
      persistenceEnabled,
    });

    if (prep.blocked) {
      return new Response(
        JSON.stringify({ content: prep.blockMessage || 'Request blocked.', securityWarning: true }),
        { status: 400 },
      );
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let fullContent = '';
        const streamModel = DEFAULT_MODEL_ID;

        try {
          try {
            const result = streamText({
              model: getModel(),
              messages: prep.messages,
              temperature: 0.7,
            });

            for await (const delta of result.textStream) {
              if (delta) {
                fullContent += delta;
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ content: delta })}\n\n`),
                );
              }
            }
          } catch (err) {
            console.error('[stream] LLM streaming failed, using fallback:', err);
            try {
              const fallback = await generateText({
                model: getModel(),
                messages: prep.messages,
              });
              const fallbackContent = fallback.text || '';
              fullContent = fallbackContent;
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ content: fallbackContent })}\n\n`),
              );
            } catch (fallbackErr) {
              console.error('[stream] Fallback also failed:', fallbackErr);
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ error: 'AI service unavailable. Please try again.' })}\n\n`,
                ),
              );
            }
          }

          // Persist + store memory via workflow
          if (fullContent) {
            await agentWorkflow.finishStream(
              prep.ctx,
              prep.userQuery,
              fullContent,
              streamModel,
              Date.now() - startTime,
              persistenceEnabled,
              memoryEnabled,
            ).catch((e: unknown) => console.error('[stream] finishStream failed:', e));
          }

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ done: true, modelUsed: streamModel })}\n\n`),
          );
        } finally {
          // Always release the stream so the runtime request queue never fills up.
          try { controller.close(); } catch { /* already closed */ }
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    console.error('[stream] Unhandled error:', error);
    return new Response(JSON.stringify({ error: 'Stream failed.' }), { status: 500 });
  }
}
