import { NextResponse } from 'next/server';
import { traceStore } from '@/lib/master/trace';
import { intelligentCache } from '@/lib/master/cache';

export async function GET() {
  return NextResponse.json({
    stats: traceStore.stats(),
    cache: intelligentCache.stats(),
    recent: traceStore.getRecent(25),
  });
}