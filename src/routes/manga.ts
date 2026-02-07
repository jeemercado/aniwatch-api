import { Hono } from "hono";
import type { Context } from "hono";
import { MANGA } from "@consumet/extensions";
import { cache } from "../config/cache.js";
import type { ServerContext } from "../config/context.js";

const mangaRouter = new Hono<ServerContext>();
const mangahere = new MANGA.MangaHere();
const LONG_CACHE_DURATION = 60 * 60 * 12; // 12 hours

// Ensure adult-content bypass cookie is always present.
// MangaHere may redirect between hosts; setting canonical base URL + default
// cookie headers improves reliability for /info and /read scraping.
// noshowdanmaku
const mangahereInternal = mangahere as any;
mangahereInternal.baseUrl = "https://www.mangahere.cc";
mangahereInternal.client.defaults.headers.common.Cookie = "isAdult=1;noshowdanmaku=1;showdanmaku=1";
mangahereInternal.client.defaults.headers.common.cookie = "isAdult=1;noshowdanmaku=1;showdanmaku=1";

function badRequest(c: Context<ServerContext>, message: string) {
    return c.json({ status: 400, message }, { status: 400 });
}

async function withCachedData<T>(
    c: Context<ServerContext>,
    fetcher: () => Promise<T>,
    customDuration?: number
) {
    const cacheConfig = c.get("CACHE_CONFIG");
    const data = await cache.getOrSet<T>(
        fetcher,
        cacheConfig.key,
        customDuration || cacheConfig.duration
    );

    return c.json({ status: 200, data }, { status: 200 });
}

mangaRouter.get("/", (c) =>
    c.json(
        {
            status: 200,
            data: {
                providers: ["mangahere"],
            },
        },
        { status: 200 }
    )
);

mangaRouter.get("/mangahere/info", async (c) => {
    const id = decodeURIComponent(c.req.query("id") || "");
    if (!id) return badRequest(c, "`id` query param is required");
    return withCachedData(c, async () => {
        const data = await mangahere.fetchMangaInfo(id);
        return {
            ...data,
            chapters: (data.chapters || []).reverse(),
        };
    }, LONG_CACHE_DURATION);
});

mangaRouter.get("/mangahere/read", async (c) => {
    const chapterId = decodeURIComponent(c.req.query("chapterId") || "");

    if (!chapterId) return badRequest(c, "`chapterId` query param is required");
    return withCachedData(c, () => mangahere.fetchChapterPages(chapterId), LONG_CACHE_DURATION);
});

mangaRouter.get("/mangahere/rankings", async (c) => {
    const type = (c.req.query("type") || "total") as
        | "total"
        | "month"
        | "week"
        | "day";

    if (!["total", "month", "week", "day"].includes(type)) {
        return badRequest(c, "`type` must be one of: total, month, week, day");
    }

    return withCachedData(c, () => mangahere.fetchMangaRanking(type));
});

mangaRouter.get("/mangahere/hot", async (c) =>
    withCachedData(c, () => mangahere.fetchMangaHotReleases())
);

mangaRouter.get("/mangahere/trending", async (c) =>
    withCachedData(c, () => mangahere.fetchMangaTrending())
);

mangaRouter.get("/mangahere/recent-updates", async (c) => {
    const page = Number(c.req.query("page") || "") || 1;
    return withCachedData(c, () => mangahere.fetchMangaRecentUpdate(page));
});

mangaRouter.get("/mangahere/home", async (c) => {
    return withCachedData(c, async () => {
        const [top10Today, top10Weekly, hot, trending, recentUpdates] =
            await Promise.all([
                mangahere.fetchMangaRanking("day"),
                mangahere.fetchMangaRanking("week"),
                mangahere.fetchMangaHotReleases(),
                mangahere.fetchMangaTrending(),
                mangahere.fetchMangaRecentUpdate(1),
            ]);

        return {
            top10Today: (top10Today.results || []).slice(0, 10),
            top10Weekly: (top10Weekly.results || []).slice(0, 10),
            hot: hot.results || [],
            trending: (trending.results || []).slice(0, 10),
            recentUpdates: recentUpdates.results || [],
        };
    }, LONG_CACHE_DURATION);
});

mangaRouter.get("/mangahere/:query", async (c) => {
    const query = decodeURIComponent(c.req.param("query"));
    const page = Number(c.req.query("page") || "") || undefined;
    return withCachedData(c, () => mangahere.search(query, page));
});

// Non-MangaHere providers are intentionally disabled for now.
// - mangadex
// - mangapill
// - mangakakalot
// - mangareader / managreader

export { mangaRouter };
