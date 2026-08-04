import { NextRequest } from 'next/server';
import {
  masterOrchestrator,
  skillRouter,
  plannerAgent,
  traceStore,
} from '@/lib/master';
import { securityGuard } from '@/lib/security/guard';
import type { OrchestrationTrace } from '@/lib/master/trace';

/**
 * POST /api/master/stream
 *
 * Upgrades orchestration to stream progress as Server-Sent Events:
 *   data: {"type":"phase","phase":"Understanding request...","step":0}
 *   data: {"type":"phase","phase":"Selecting skills...","step":1}
 *   ...
 *   data: {"type":"token","content":"..."}          // final answer streamed
 *   data: {"type":"done","result":"...","skills":[...]}
 *
 * Uses the existing streaming infrastructure (ReadableStream + TextEncoder).
 */
export async function POST(request: NextRequest) {
  const start = Date.now();
  const encoder = new TextEncoder();

  const send = (controller: ReadableStreamDefaultController<Uint8Array>, obj: unknown) => {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
  };

  let stream: ReadableStream | null = null;

  try {
    const body = await request.json();
    const { input, conversationId, debug } = body;

    if (!input || typeof input !== 'string') {
      return new Response(JSON.stringify({ error: 'Provide input.' }), { status: 400 });
    }

    // Security gate.
    const safety = securityGuard.analyzePrompt(input);
    if (!safety.isSafe) {
      return new Response(
        JSON.stringify({ error: 'Request blocked by safety check.' }),
        { status: 400 },
      );
    }

    const trace = traceStore.begin(input);

    stream = new ReadableStream({
      async start(controller) {
        let step = 0;
        const phase = (name: string) => {
          send(controller, { type: 'phase', phase: name, step: step++ });
        };

        try {
          phase('Understanding request...');
          const analysis = masterOrchestrator.analyze({ input });

          phase('Selecting skills...');
          const route = await skillRouter.smartRoute(analysis, { threshold: 0.55 });

          phase('Building execution plan...');
          const plan = await plannerAgent.plan(analysis);

          const skills = [...new Set(plan.detectedSkills)];

          // Stream the plan phases so the UI can show progress.
          for (const p of plan.phases) {
            phase(`${p.name}...`);
          }

          // Execute and stream the final answer token-by-token via a per-token
          // callback is complex here; instead we run and stream the merged result.
          phase('Reviewing...');

          const response = await masterOrchestrator.run({
            input,
            conversationId,
            debug: Boolean(debug),
          });

          // Emit the final result (chunked for smooth rendering).
          const text = response.result || '';
          const chunkSize = 120;
          for (let i = 0; i < text.length; i += chunkSize) {
            send(controller, { type: 'token', content: text.slice(i, i + chunkSize) });
          }

          send(controller, {
            type: 'done',
            result: text,
            intent: response.intent,
            domains: response.domains,
            outputFormat: response.outputFormat,
            latencyMs: Date.now() - start,
            skills: response.skillsUsed || skills,
            error: response.error,
          });
        } catch (err) {
          console.error('[master/stream] Error:', err);
          send(controller, {
            type: 'error',
            error: 'Orchestration failed. Please try again.',
          });
        } finally {
          traceStore.finish(trace, 'success', Date.now() - start);
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
    console.error('[master/stream] Unhandled:', error);
    return new Response(JSON.stringify({ error: 'Stream failed.' }), { status: 500 });
  }
}