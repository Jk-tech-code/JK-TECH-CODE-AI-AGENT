import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, unauthorized } from '@/lib/auth';
import { rateLimit } from '@/lib/security/rate-limit';
import { securityGuard } from '@/lib/security/guard';
import { codeSandbox } from '@/brain/autonomy';
import type { SandboxRuntime } from '@/brain/autonomy';

const RUNTIMES = ['javascript', 'typescript', 'sql', 'shell'];

/** POST /api/sandbox — run code in the secure sandbox. */
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser().catch(() => null);
  if (!user) return unauthorized();

  const rl = rateLimit(`sandbox:${user.id}`, { limit: 30, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded. Try again shortly.' }, {
      status: 429,
      headers: { 'Retry-After': String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))) },
    });
  }

  try {
    const body = (await request.json()) as { runtime?: string; code?: string; timeoutMs?: number };
    const runtime = body.runtime ?? 'javascript';
    if (!RUNTIMES.includes(runtime)) {
      return NextResponse.json({ error: `Unsupported runtime. Allowed: ${RUNTIMES.join(', ')}` }, { status: 400 });
    }
    const code = (body.code ?? '').slice(0, 100_000);
    if (!code.trim()) return NextResponse.json({ error: 'code is required.' }, { status: 400 });

    // Reject prompt-injection payloads in the code (defense in depth).
    const injected = securityGuard.analyzePrompt(code);
    if (!injected.isSafe) {
      return NextResponse.json({ error: 'Code contains disallowed instructions.' }, { status: 400 });
    }

    const result = await codeSandbox.run({ runtime: runtime as SandboxRuntime, code, timeoutMs: body.timeoutMs });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: 'Sandbox execution failed.' }, { status: 500 });
  }
}