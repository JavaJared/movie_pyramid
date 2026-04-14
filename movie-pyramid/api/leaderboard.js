// /api/leaderboard.js
// GET  -> returns top 10 scores
// POST -> validates and inserts a new score, returns updated top 10
//
// Uses Upstash Redis sorted sets. Create an Upstash Redis database from the
// Vercel Marketplace (Storage tab) and it will auto-populate these env vars:
//   KV_REST_API_URL
//   KV_REST_API_TOKEN
// (Upstash's own env var names are UPSTASH_REDIS_REST_URL / _TOKEN — both
// work with the Redis.fromEnv() helper.)

import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();
const LB_KEY = 'movie-pyramid:leaderboard';
const LB_MAX = 10;

// Theoretical max: 4 rows × (base + 2×base obscurity) + 15 guesses × 50 bonus
//   row 4 (4 slots, base 100): 4 × 300  = 1200
//   row 3 (3 slots, base 150): 3 × 450  = 1350
//   row 2 (2 slots, base 250): 2 × 750  = 1500
//   row 1 (1 slot,  base 400): 1 × 1200 = 1200
//   completion bonus (if you somehow used 0 guesses): 15 × 50 = 750
// Grand total ceiling: 6000. Pad a bit for safety.
const MAX_PLAUSIBLE_SCORE = 7000;

function sanitizeInitials(raw) {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
  if (cleaned.length === 0) return null;
  return cleaned.padEnd(3, 'A');
}

async function getTopEntries() {
  // ZRANGE with REV returns members in descending score order.
  // withScores gives us [member, score, member, score, ...] or [{member, score}]
  // depending on the client version. Use the options form to be explicit.
  const result = await redis.zrange(LB_KEY, 0, LB_MAX - 1, {
    rev: true,
    withScores: true,
  });

  // Upstash returns [member, score, member, score, ...] as a flat array.
  const entries = [];
  for (let i = 0; i < result.length; i += 2) {
    const member = result[i];
    const score = Number(result[i + 1]);
    // member is stored as "INITIALS|timestamp" to keep entries unique
    const [initials] = String(member).split('|');
    entries.push({ initials, score });
  }
  return entries;
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const entries = await getTopEntries();
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ entries });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const initials = sanitizeInitials(body?.initials);
      const score = Number(body?.score);

      if (!initials) {
        return res.status(400).json({ error: 'Invalid initials' });
      }
      if (!Number.isFinite(score) || score <= 0 || score > MAX_PLAUSIBLE_SCORE) {
        return res.status(400).json({ error: 'Invalid score' });
      }

      // Unique member so two players with the same initials+score don't collide
      const member = `${initials}|${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await redis.zadd(LB_KEY, { score, member });

      // Trim to top LB_MAX: remove everything ranked below index LB_MAX-1
      // ZREMRANGEBYRANK with rank 0 = lowest score. To keep top N by descending
      // score, remove ranks 0 through -(LB_MAX+1).
      await redis.zremrangebyrank(LB_KEY, 0, -(LB_MAX + 1));

      const entries = await getTopEntries();
      return res.status(200).json({ entries });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Leaderboard route error', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
