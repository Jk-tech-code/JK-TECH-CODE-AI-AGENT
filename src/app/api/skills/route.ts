import { NextRequest, NextResponse } from 'next/server';
import { dynamicSkillRegistry } from '@/lib/skills/registry';

/**
 * GET /api/skills
 * Lists all dynamically discovered skills from /skills.
 * ?q=search terms   — fuzzy search by name/keywords/description
 * ?limit=N          — cap results (default 50)
 */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q') || '';
  const limit = Math.min(Number(request.nextUrl.searchParams.get('limit')) || 50, 200);

  try {
    const skills = q
      ? await dynamicSkillRegistry.search(q, limit)
      : (await dynamicSkillRegistry.getAll()).slice(0, limit);

    return NextResponse.json({
      total: skills.length,
      query: q || undefined,
      skills: skills.map(s => ({
        id: s.id,
        name: s.name,
        description: s.description,
        keywords: s.keywords.slice(0, 8),
        tags: s.tags.slice(0, 8),
        capabilities: s.capabilities,
        priority: s.priority,
        executable: s.executable,
        author: s.author,
        version: s.version,
      })),
    });
  } catch (error) {
    console.error('Skills API error:', error);
    return NextResponse.json({ error: 'Skill registry unavailable.' }, { status: 500 });
  }
}