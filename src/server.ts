import https from "https";
import { readFile } from "node:fs/promises";

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";

import { log } from "./config/logger.js";
import { corsConfig } from "./config/cors.js";
import { ratelimit } from "./config/ratelimit.js";
import { execGracefulShutdown } from "./utils.js";
import { DeploymentEnv, env, SERVERLESS_ENVIRONMENTS } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./config/errorHandler.js";
import type { ServerContext } from "./config/context.js";

import { hianimeRouter } from "./routes/hianime.js";
import { logging } from "./middleware/logging.js";
import { cacheConfigSetter, cacheControl } from "./middleware/cache.js";

import pkgJson from "../package.json" with { type: "json" };

//
const BASE_PATH = "/api/v2" as const;

const app = new Hono<ServerContext>();

app.use(logging);
app.use(corsConfig);
app.use(cacheControl);

/*
    CAUTION: 
    Having the "ANIWATCH_API_HOSTNAME" env will
    enable rate limitting for the deployment.
    WARNING:
    If you are using any serverless environment, you must set the
    "ANIWATCH_API_DEPLOYMENT_ENV" to that environment's name, 
    otherwise you may face issues.
*/
const isPersonalDeployment = Boolean(env.ANIWATCH_API_HOSTNAME);
if (isPersonalDeployment) {
    app.use(ratelimit);
}

// if (env.ANIWATCH_API_DEPLOYMENT_ENV === DeploymentEnv.NODEJS) {
app.use("/", serveStatic({ root: "public" }));
// }

app.get("/health", (c) => c.text("daijoubu", { status: 200 }));
app.get("/v", async (c) =>
    c.text(
        `aniwatch-api: v${"version" in pkgJson && pkgJson?.version ? pkgJson.version : "-1"}\n` +
            `aniwatch-package: v${"dependencies" in pkgJson && pkgJson?.dependencies?.aniwatch ? pkgJson?.dependencies?.aniwatch : "-1"}`
    )
);

if (env.ENABLE_SWAGGER_UI) {
    const openApiSpecUrl = "/docs/openapi.yaml";
    const swaggerHtml = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Aniwatch API Docs</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="/docs/swagger-ui.css" />
    <style>
      html, body { margin: 0; padding: 0; }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="/docs/swagger-ui-bundle.js"></script>
    <script src="/docs/swagger-ui-standalone-preset.js"></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: "${openApiSpecUrl}",
        dom_id: "#swagger-ui",
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        layout: "StandaloneLayout"
      });
    </script>
  </body>
</html>`;

    app.get("/docs", (c) => c.html(swaggerHtml));
    app.get("/docs/", (c) => c.html(swaggerHtml));
    app.get(openApiSpecUrl, async (c) => {
        const spec = await readFile(
            new URL("../docs/openapi.yaml", import.meta.url),
            "utf8"
        );
        return c.text(spec, {
            status: 200,
            headers: { "Content-Type": "application/yaml" },
        });
    });
    app.use(
        "/docs/*",
        serveStatic({
            root: "node_modules/swagger-ui-dist",
            rewriteRequestPath: (path) => path.replace(/^\/docs/, ""),
        })
    );
}

app.use(cacheConfigSetter(BASE_PATH.length));

app.basePath(BASE_PATH).route("/hianime", hianimeRouter);
app.basePath(BASE_PATH).get("/anicrush", (c) =>
    c.text("Anicrush could be implemented in future.")
);

app.notFound(notFoundHandler);
app.onError(errorHandler);

//
(function () {
    /*
        NOTE:
        "ANIWATCH_API_DEPLOYMENT_MODE" env must be set to
        its supported name for serverless deployments
        Eg: "vercel" for vercel deployments
    */
    if (SERVERLESS_ENVIRONMENTS.includes(env.ANIWATCH_API_DEPLOYMENT_ENV)) {
        return;
    }

    const server = serve({
        port: env.ANIWATCH_API_PORT,
        fetch: app.fetch,
    }).addListener("listening", () =>
        log.info(
            `aniwatch-api RUNNING at http://localhost:${env.ANIWATCH_API_PORT}`
        )
    );

    process.on("SIGINT", () => execGracefulShutdown(server));
    process.on("SIGTERM", () => execGracefulShutdown(server));
    process.on("uncaughtException", (err) => {
        log.error(`Uncaught Exception: ${err.message}`);
        execGracefulShutdown(server);
    });
    process.on("unhandledRejection", (reason, promise) => {
        log.error(
            `Unhandled Rejection at: ${promise}, reason: ${reason instanceof Error ? reason.message : reason}`
        );
        execGracefulShutdown(server);
    });

    /*
        CAUTION:
        The `if` below block is for `render free deployments` only,
        as their free tier has an approx 10 or 15 minute sleep time.
        This is to keep the server awake and prevent it from sleeping.
        You can enable the automatic health check by setting the
        environment variables "ANIWATCH_API_HOSTNAME" to your deployment's hostname,
        and "ANIWATCH_API_DEPLOYMENT_ENV" to "render" in your environment variables.
        If you are not using render, you can remove the below `if` block.
    */
    if (
        isPersonalDeployment &&
        env.ANIWATCH_API_DEPLOYMENT_ENV === DeploymentEnv.RENDER
    ) {
        const INTERVAL_DELAY = 8 * 60 * 1000; // 8mins
        const url = new URL(`https://${env.ANIWATCH_API_HOSTNAME}/health`);

        // don't sleep
        setInterval(() => {
            https
                .get(url.href)
                .on("response", () => {
                    log.info(
                        `aniwatch-api HEALTH_CHECK at ${new Date().toISOString()}`
                    );
                })
                .on("error", (err) =>
                    log.warn(
                        `aniwatch-api HEALTH_CHECK failed; ${err.message.trim()}`
                    )
                );
        }, INTERVAL_DELAY);
    }
})();

export default app;
