# Aniwatch API Repo Summary

## Stack
- Runtime: Node.js
- Language: TypeScript
- Web framework: Hono
- Scraper/data source: aniwatch (HiAnime scraper)
- Caching: Redis via ioredis (optional)
- Rate limiting: hono-rate-limiter (optional)
- Logging: pino + pino-pretty
- Env validation: envalid + dotenv
- Serverless adapter: Vercel (api/index.ts)

## What It Does
- Exposes a REST API that scrapes anime data from hianimez.to through the aniwatch library.
- Serves static assets from public/ at the root path.
- Provides health and version endpoints.

## Base Paths
- Root: /
- API base: /api/v2

## Routes (All GET)

### Root
- /health
- /v

### API
- /api/v2/anicrush
- /api/v2/hianime/
- /api/v2/hianime/home
- /api/v2/hianime/azlist/{sortOption}?page={page}
- /api/v2/hianime/qtip/{animeId}
- /api/v2/hianime/category/{name}?page={page}
- /api/v2/hianime/genre/{name}?page={page}
- /api/v2/hianime/producer/{name}?page={page}
- /api/v2/hianime/schedule?date={date}&tzOffset={tzOffset}
- /api/v2/hianime/search?q={query}&page={page}&filters={...}
- /api/v2/hianime/search/suggestion?q={query}
- /api/v2/hianime/anime/{animeId}
- /api/v2/hianime/anime/{animeId}/episodes
- /api/v2/hianime/anime/{animeId}/next-episode-schedule
- /api/v2/hianime/episode/servers?animeEpisodeId={animeEpisodeId}
- /api/v2/hianime/episode/sources?animeEpisodeId={animeEpisodeId}&server={server}&category={sub|dub|raw}

## Caching
- HTTP cache headers are always set via middleware:
  - Cache-Control: s-maxage and stale-while-revalidate from env.
- Redis response caching is optional and enabled only if ANIWATCH_API_REDIS_CONN_URL is set.
- Default TTL is 300 seconds. You can override TTL per request with the Aniwatch-Cache-Expiry header.
- If Redis is enabled, the response echoes the Aniwatch-Cache-Expiry header.

## Security and Controls
- Rate limiting is enabled only if ANIWATCH_API_HOSTNAME is set.
- CORS is enabled for GET requests; origins are configured by ANIWATCH_API_CORS_ALLOWED_ORIGINS or default to http://localhost:4000 and *.
- No authentication or authorization is implemented.
- Errors are returned as JSON with status codes; HiAnime errors pass through their status and message.

## Key Files
- src/server.ts
- src/routes/hianime.ts
- src/config/cache.ts
- src/middleware/cache.ts
- src/config/ratelimit.ts
- src/config/cors.ts
- src/config/errorHandler.ts
- src/config/env.ts
