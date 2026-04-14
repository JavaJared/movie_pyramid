// /api/tmdb.js
// Proxies TMDB API calls so the key stays server-side.
// Usage: GET /api/tmdb?path=/search/movie&query=batman

export default async function handler(req, res) {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'TMDB_API_KEY not configured' });
  }

  const { path, ...params } = req.query;
  if (!path || typeof path !== 'string' || !path.startsWith('/')) {
    return res.status(400).json({ error: 'Invalid path' });
  }

  // Whitelist the TMDB endpoints we actually use — prevents abusing the proxy
  // as a generic TMDB gateway for unrelated queries.
  const allowedPatterns = [
    /^\/search\/person$/,
    /^\/search\/movie$/,
    /^\/person\/\d+\/movie_credits$/,
    /^\/movie\/\d+$/,
    /^\/configuration$/,
  ];
  if (!allowedPatterns.some((re) => re.test(path))) {
    return res.status(403).json({ error: 'Path not allowed' });
  }

  const url = new URL(`https://api.themoviedb.org/3${path}`);
  url.searchParams.set('api_key', apiKey);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }

  try {
    const upstream = await fetch(url.toString());
    const body = await upstream.text();
    // Cache successful GETs at the edge for 1 hour — TMDB data is slow-moving.
    if (upstream.ok) {
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    }
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    return res.send(body);
  } catch (err) {
    console.error('TMDB proxy error', err);
    return res.status(502).json({ error: 'Upstream fetch failed' });
  }
}
