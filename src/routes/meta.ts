import { Hono } from "hono";
import type { ServerContext } from "../config/context.js";

const metaRouter = new Hono<ServerContext>();

// Manga-related meta routes are intentionally disabled for now.
// We can re-enable `/meta/anilist-manga/*` later when needed.

export { metaRouter };
