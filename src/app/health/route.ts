import { NextResponse } from 'next/server';
import { checkHealth, healthHttpStatus } from '@/lib/integrations/health';
import { getEnvDiagnostics, validateConfig, activeProvider } from '@/brain/providers/llm';

/** GET /health — status of every integrated provider + LLM config diagnostics. */
export async function GET() {
  const payload = await checkHealth();
  const llmConfig = validateConfig();
  return NextResponse.json(
    {
      ...payload,
      llm: {
        activeProvider: activeProvider(),
        configured: llmConfig.ok,
        errors: llmConfig.errors,
        env: getEnvDiagnostics().env,
      },
    },
    { status: healthHttpStatus(payload) },
  );
}
