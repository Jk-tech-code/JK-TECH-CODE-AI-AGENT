import { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { agentWorkflow } from '@/lib/core/workflow';
import type { TaskCategory } from '@/lib/core/types';
import { getAuthenticatedUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { securityGuard } from '@/lib/security/guard';
import { brainStream } from '@/brain';
import { loadSettings } from '@/brain/settings';
import { createLogger } from '@/lib/logging/logger';
import { rateLimit } from '@/lib/security/rate-limit';

const streamLogger = createLogger('chat:stream');

interface AttachmentRef {
  id: string;
  fileType?: string;
  title?: string;
}

/**
 * POST /api/chat/stream
 *
 * Server-Sent Events streaming chat, routed through the Brain.
 *   • Auth + conversation ownership + safety gate (unchanged).
 *   • The Brain runs the full pipeline (intent → context → memory → knowledge
 *     → planning → reasoning → Ollama/Qwen3 → verify → reflect → humanize).
 *   • The LLM stream runs through the Ollama provider (native NDJSON) with a
 *     graceful OpenAI-compatible fallback when configured.
 *
 * SSE events: `{status}` (thinking/generating), `{content}` deltas,
 * `{done, modelUsed}`, and `{error}` (retryable, never a blank bubble).
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const { messages, query, conversationId, taskCategory, zapierEvent, zapierService, attachments, model } = body;

    if (!messages && !query) {
      return new Response(JSON.stringify({ error: 'Provide a message or query.' }), { status: 400 });
    }

    // Stricter per-user chat rate limit on top of the middleware IP limit
    // (Ollama generation is compute-heavy; this protects the local server).
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || '127.0.0.1';
    const rlKey = conversationId ? `chat:${conversationId}` : `chat:anon:${ip}`;
    const rl = rateLimit(rlKey, { limit: 30, windowMs: 60_000 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many messages. Please wait a moment and try again.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))),
            'X-RateLimit-Limit': String(rl.limit),
            'X-RateLimit-Remaining': '0',
          },
        },
      );
    }

    // Verify conversation ownership if conversationId is provided
    let user: { id: string } | null = null;
    if (conversationId) {
      user = await getAuthenticatedUser();
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
    } else {
      // Still resolve the user for attachment ownership checks.
      user = await getAuthenticatedUser().catch(() => null);
    }

    const chatMessages: Array<{ role: 'user' | 'assistant'; content: string }> =
      messages && Array.isArray(messages) && messages.length > 0
        ? messages.filter((m: any) => m.role === 'user' || m.role === 'assistant')
        : query && typeof query === 'string'
          ? [{ role: 'user', content: query }]
          : [];

    if (chatMessages.length === 0) {
      return new Response(JSON.stringify({ error: 'Provide a message or query.' }), { status: 400 });
    }

    const userQuery = query || chatMessages.filter((m) => m.role === 'user').pop()?.content || '';

    // Safety gate (unchanged from the workflow).
    const safety = securityGuard.analyzePrompt(userQuery);
    if (!safety.isSafe) {
      return new Response(
        JSON.stringify({ content: 'Request blocked by safety check.', securityWarning: true }),
        { status: 400 },
      );
    }

    // Per-user Brain settings (falls back to env defaults for anonymous).
    const settings = await loadSettings(user?.id);

    // Accept an explicit model from the client (validated below by the Brain
    // settings resolution — unknown values fall back to the configured model).
    if (model && typeof model === 'string' && model.startsWith('qwen3')) {
      settings.model = model;
    } else if (model && typeof model === 'string' && model !== 'z-ai-default') {
      // Keep logical cloud-model ids working through the OpenAI-compatible
      // provider only when explicitly configured for it.
      settings.provider = 'openai';
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let fullContent = '';
        let streamErrorSent = false;

        const sendError = (message: string, retryable = true) => {
          if (streamErrorSent) return;
          streamErrorSent = true;
          streamLogger.error(`Error event: ${message}`);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: message, retryable })}\n\n`),
          );
        };

        const sendStatus = (status: 'thinking' | 'generating') => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status })}\n\n`));
        };

        try {
          const generator = brainStream(
            {
              messages: chatMessages,
              query: userQuery,
              conversationId,
              userId: user?.id,
              attachments: attachments as AttachmentRef[] | undefined,
              settings,
              taskCategory: taskCategory || 'general',
            },
            { onStatus: (s) => sendStatus(s) },
          );

          let modelUsed = settings.model;

          for await (const ev of generator) {
            if (ev.type === 'status') {
              sendStatus(ev.value as 'thinking' | 'generating');
            } else if (ev.type === 'content') {
              const delta = ev.value as string;
              if (delta) {
                fullContent += delta;
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: delta })}\n\n`));
              }
            } else if (ev.type === 'done') {
              const done = ev.value as { content: string; modelUsed: string; confidence: number };
              fullContent = done.content;
              modelUsed = done.modelUsed || modelUsed;
            } else if (ev.type === 'error') {
              const err = ev.value as { message: string; retryable: boolean };
              sendError(err.message, err.retryable !== false);
            }
          }

          // Never complete a request with a blank reply.
          if (!fullContent.trim() && !streamErrorSent) {
            sendError('The assistant returned an empty response. Please try again.');
          }

          // Persist + store memory via workflow (only successful responses).
          if (fullContent.trim() && !streamErrorSent) {
            await agentWorkflow.finishStream(
              {
                requestId: `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                startTime,
                userId: user?.id,
                conversationId,
                taskCategory: (taskCategory || 'general') as TaskCategory,
              },
              userQuery,
              fullContent,
              modelUsed,
              Date.now() - startTime,
              true, // persistenceEnabled
              settings.memoryEnabled !== false, // memoryEnabled
            ).catch((e: unknown) => streamLogger.error('finishStream failed', e));
          }

          if (!streamErrorSent) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ done: true, modelUsed })}\n\n`),
            );
          }
        } finally {
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
    streamLogger.error('Unhandled stream error', error);
    return new Response(JSON.stringify({ error: 'Stream failed. Please try again.' }), { status: 500 });
  }
}