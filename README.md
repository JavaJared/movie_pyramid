# Movie Pyramid

A cinephile's pyramid-guessing game. Each round builds a four-tier pyramid where each row pairs a mainstream actor with a random category (genre, decade, director, studio, budget band, etc.) and asks you to name films from that actor's filmography that fit. Harder picks earn more points. Top 10 scores persist on a global leaderboard.

## Project structure

```
movie-pyramid/
├── api/
│   ├── leaderboard.js   # GET top 10, POST new score (Upstash Redis)
│   └── tmdb.js          # Proxies TMDB calls, keeps API key server-side
├── public/
│   └── index.html       # Single-file frontend (HTML + CSS + JS)
├── package.json
├── vercel.json
└── .env.example
```

## Setup

### 1. Clone and install

```bash
git clone <your-repo-url>
cd movie-pyramid
npm install
```

### 2. Get a TMDB API key

Sign up at [themoviedb.org](https://www.themoviedb.org/signup), then go to **Settings → API** and request a free developer key. Copy the **API Key (v3 auth)** value.

### 3. Create a Vercel project

```bash
npm install -g vercel
vercel link
```

### 4. Add an Upstash Redis database

In the Vercel dashboard, open your project → **Storage** tab → **Create Database** → select **Upstash** → **Redis**. Pick the free tier. Vercel will automatically inject `KV_REST_API_URL` and `KV_REST_API_TOKEN` as environment variables in your project.

### 5. Add the TMDB key to Vercel

In the Vercel dashboard → project → **Settings → Environment Variables**, add:

- Key: `TMDB_API_KEY`
- Value: your v3 key from step 2
- Environments: Production, Preview, Development

### 6. Local development

Create `.env.local` from `.env.example` and fill in your values. Then:

```bash
vercel dev
```

Open [http://localhost:3000](http://localhost:3000).

### 7. Deploy

```bash
vercel --prod
```

## How scoring works

Each row has a tier (1 = hardest/apex, 4 = easiest/base). Base points per correct slot:

| Tier | Slots | Base points |
|------|-------|-------------|
| 4 (base) | 4 | 100 |
| 3 | 3 | 150 |
| 2 | 2 | 250 |
| 1 (apex) | 1 | 400 |

Plus an **obscurity bonus** scaling from 0× to 2× base depending on how buried the pick is in that row's eligible pool (rarer picks = more points), and **+50 per remaining guess** as a completion bonus.

Theoretical ceiling is ~6000 points. The server rejects any submitted score above 7000 as impossible.

## Security notes

- **TMDB key** is stored as a Vercel env var and only ever used server-side in `/api/tmdb`. The browser never sees it.
- **TMDB proxy** whitelists the specific endpoints the game uses so it can't be abused as a general-purpose TMDB gateway.
- **Score validation** on `POST /api/leaderboard` sanitizes initials and bounds scores. This isn't bulletproof — a determined attacker can still POST a valid-looking score up to the ceiling — but it blocks the lowest-effort cheating. For stronger integrity you'd need server-side game state (each round issued a signed token, scores reconciled against server-authoritative answer pools), which is a bigger lift.
- **No rate limiting** is wired up. If the leaderboard starts getting spammed, add Upstash Ratelimit on the POST route.

## Costs

- **TMDB**: free for non-commercial use, no rate limit worth worrying about at this scale.
- **Vercel**: free hobby tier covers this easily.
- **Upstash Redis**: free tier includes 10,000 commands per day, which is plenty — each page load does 1 read and each completed pyramid does ~2 writes.
