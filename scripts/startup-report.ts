/**
 * Startup integration report.
 *
 * Prints the provider status table, e.g.:
 *   OpenAI .............. ✅ Connected
 *   Gemini .............. ⚠️ Missing configuration
 *   ...
 *   Overall Status: READY
 *
 * Usage: bun run scripts/startup-report.ts
 */
import { runStartupReport } from '../src/lib/integrations/startup';
import { registerAllIntegrations } from '../src/lib/integrations/register';

async function main() {
  registerAllIntegrations();
  const { report, status } = await runStartupReport();
  console.log('\n' + report);
  console.log(`\n[exit=${status === 'ready' ? 0 : status === 'degraded' ? 0 : 1}]`);
  process.exit(status === 'error' ? 1 : 0);
}

main().catch(err => {
  console.error('Startup report failed:', err);
  process.exit(1);
});
