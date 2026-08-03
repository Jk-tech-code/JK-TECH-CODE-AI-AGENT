import { NextRequest, NextResponse } from 'next/server';
import { agentWorkflow } from '@/lib/core/workflow';
import { handleApiError } from '@/lib/error/handler';
import { getAuthenticatedUser } from '@/lib/auth';
import { db } from '@/lib/db';

/**
 * POST /api/chat
 *
 * Non-streaming chat completion.
 * Delegates all logic to AgentWorkflow.execute().
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages, query, conversationId, taskCategory, zapierEvent, zapierService } = body;

    if (!messages && !query) {
      return NextResponse.json(
        { error: 'Please provide a message or query.' },
        { status: 400 },
      );
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

    const workflowMessages: Array<{ role: string; content: string }> = [];
    if (messages && Array.isArray(messages) && messages.length > 0) {
      workflowMessages.push(...messages);
    } else if (query && typeof query === 'string') {
      workflowMessages.push({ role: 'user', content: query });
    }

    const result = await agentWorkflow.execute({
      messages: workflowMessages,
      query,
      conversationId,
      taskCategory: taskCategory || 'general',
      zapierEvent,
      zapierService,
      thinking: true,
      searchEnabled: true,
      memoryEnabled: true,
      persistenceEnabled: true,
    });

    if (result.securityReport && !result.securityReport.isSafe) {
      return NextResponse.json({
        content: result.content,
        securityWarning: true,
      });
    }

    return NextResponse.json({
      content: result.content,
      modelUsed: result.modelUsed,
      confidence: result.confidence,
      latencyMs: result.latencyMs,
      sources: result.sources,
      conversationId: result.conversationId,
      source: 'workflow',
    });
  } catch (error) {
    return handleApiError(error);
  }
}
