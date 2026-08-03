import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthenticatedUser, unauthorized } from '@/lib/auth';

/**
 * Helper: returns the user ID if authenticated, otherwise returns a 401 response.
 */
async function getUserIdOrReject(): Promise<string | NextResponse> {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();
  return user.id;
}

export async function GET(request: NextRequest) {
  const userId = await getUserIdOrReject();
  if (userId instanceof NextResponse) return userId;

  const conversations = await db.conversation.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    take: 50,
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
        take: 1,
      },
    },
  });

  return NextResponse.json({
    conversations: conversations.map(c => ({
      id: c.id,
      title: c.title || 'Untitled',
      messageCount: c.messages.length,
      lastMessage: c.messages[0]?.content?.slice(0, 100) || '',
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })),
  });
}

export async function POST(request: NextRequest) {
  const userId = await getUserIdOrReject();
  if (userId instanceof NextResponse) return userId;

  const body = await request.json();
  const { title, message } = body;

  const conversation = await db.conversation.create({
    data: {
      userId,
      title: title || 'New conversation',
    },
  });

  if (message) {
    await db.conversationMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'user',
        content: message,
      },
    });
  }

  return NextResponse.json({
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.createdAt,
  });
}

export async function DELETE(request: NextRequest) {
  const userId = await getUserIdOrReject();
  if (userId instanceof NextResponse) return userId;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Provide conversation id.' }, { status: 400 });

  const conversation = await db.conversation.findUnique({ where: { id } });
  if (!conversation || conversation.userId !== userId) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  await db.conversation.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
}
