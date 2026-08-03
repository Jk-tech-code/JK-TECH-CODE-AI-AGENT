const PORT = parseInt(process.env.PORT || '7100');
const CACHE_TTL = 5 * 60 * 1000;

const cache = new Map<string, { results: unknown[]; ts: number }>();

async function searchTavily(query: string, num: number, recencyDays?: number) {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error('TAVILY_API_KEY not configured');
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: Math.min(num, 10),
      search_depth: 'basic',
      topic: 'general',
      ...(recencyDays ? { days: recencyDays } : {}),
    }),
  });
  if (!response.ok) throw new Error(`Tavily search failed with status ${response.status}`);
  const data = await response.json() as { results?: Array<{ title?: string; url?: string; content?: string }> };
  return (data.results || []).map(r => ({
    title: r.title || '',
    snippet: r.content || '',
    url: r.url || '',
  }));
}

async function searchSerpapi(query: string, num: number) {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) throw new Error('SERPAPI_API_KEY not configured');
  const params = new URLSearchParams({ engine: 'google', q: query, api_key: apiKey, num: String(Math.min(num, 10)) });
  const response = await fetch(`https://serpapi.com/search.json?${params.toString()}`);
  if (!response.ok) throw new Error(`SerpAPI search failed with status ${response.status}`);
  const data = await response.json() as { organic_results?: Array<{ title?: string; link?: string; snippet?: string }> };
  return (data.organic_results || []).map(r => ({
    title: r.title || '',
    snippet: r.snippet || '',
    url: r.link || '',
  }));
}

async function searchEngine(query: string, engine: string, num: number, recencyDays?: number) {
  try {
    const results = engine === 'serpapi'
      ? await searchSerpapi(query, num)
      : await searchTavily(query, num, recencyDays);
    return results.map(r => ({ ...r, engine }));
  } catch {
    return [];
  }
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === '/search') {
      const query = url.searchParams.get('q');
      if (!query) {
        return Response.json({ error: 'Missing query parameter q' }, { status: 400 });
      }

      const engine = url.searchParams.get('engine') || 'tavily';
      const num = parseInt(url.searchParams.get('num') || '5');
      const recencyDays = url.searchParams.get('recency_days')
        ? parseInt(url.searchParams.get('recency_days')!)
        : undefined;

      const cacheKey = `${query}:${engine}:${num}:${recencyDays || 365}`;
      const cached = cache.get(cacheKey);
      if (cached && Date.now() - cached.ts < CACHE_TTL) {
        return Response.json({ results: cached.results, cached: true });
      }

      const results = await searchEngine(query, engine, num, recencyDays);
      cache.set(cacheKey, { results, ts: Date.now() });

      return Response.json({ results, engine, query });
    }

    if (url.pathname === '/health') {
      return Response.json({ status: 'ok', service: 'web-search-proxy' });
    }

    return Response.json({ error: 'Not found' }, { status: 404 });
  },
});

console.log(`[web-search-proxy] listening on :${PORT}`);