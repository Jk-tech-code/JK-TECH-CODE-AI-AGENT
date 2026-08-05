/**
 * Brain Context — assembles all retrieved knowledge into a single, de-duplicated
 * context block that is woven into the prompt (as system additions and final
 * user additions) before the model call. Prevents prompt overload.
 */
import type { BrainContextBlock, RequestContext } from './types';

const MAX_TOTAL = 7000;

/** Merge system-level guidance (planning + reasoning directives). */
export function buildSystemGuidance(ctx: Pick<RequestContext, 'planningNote' | 'reasoningNote'>): string {
  const parts = [ctx.planningNote, ctx.reasoningNote].filter(Boolean);
  return parts.length > 0 ? `\n\n${parts.join('\n\n')}` : '';
}

/** Build the user-side context block (memory + knowledge + files). */
export function buildUserContext(
  ctx: Pick<RequestContext, 'memories' | 'knowledge' | 'files' | 'userQuery'>,
): string {
  const blocks: string[] = [];
  let budget = MAX_TOTAL;

  if (ctx.files.trim()) {
    blocks.push(ctx.files.trim());
    budget -= ctx.files.length;
  }

  if (ctx.knowledge.trim() && budget > 300) {
    const kn = ctx.knowledge.trim();
    blocks.push(`\n\nRelevant background:\n${kn.slice(0, Math.min(kn.length, budget))}`);
    budget -= kn.length;
  }

  if (ctx.memories.length > 0 && budget > 300) {
    const memText = ctx.memories.map((m) => `- ${m}`).join('\n');
    blocks.push(`\n\nNotes the user may find useful (from previous interactions):\n${memText.slice(0, Math.min(memText.length, budget))}`);
  }

  if (blocks.length === 0) return '';

  // The final user instruction is preserved; context precedes it.
  return `\n\n[CONTEXT]\n${blocks.join('\n\n')}\n[/CONTEXT]`;
}

/** Compose the final BrainContextBlock for prompt injection. */
export function buildContextBlock(ctx: RequestContext): BrainContextBlock {
  return {
    systemAdditions: buildSystemGuidance(ctx),
    userAdditions: buildUserContext(ctx),
  };
}