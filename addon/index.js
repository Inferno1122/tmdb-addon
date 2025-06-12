const express = require("express");
const compression = require("compression");
const path = require("path");

const analytics = require("./utils/analytics");
const { getCatalog } = require("./lib/getCatalog");
const { getSearch } = require("./lib/getSearch");
const { getManifest, DEFAULT_LANGUAGE } = require("./lib/getManifest");
const { getMeta } = require("./lib/getMeta");
const { getTmdb } = require("./lib/getTmdb");
const { getTrending } = require("./lib/getTrending");
const { getFavorites, getWatchList } = require("./lib/getPersonalLists");
const { parseConfig, getRpdbPoster, checkIfExists } = require("./utils/parseProps");
const { blurImage } = require("./utils/imageProcessor");
const { cacheWrapMeta, cacheWrapCatalog } = require("./lib/getCache");

const addon = express();

addon.use(compression());
addon.use(analytics.middleware);
addon.use(express.static(path.join(__dirname, "../public")));

const respond = (res, data, opts = {}) => {
  const cc = [];
  if (opts.sMaxAge) cc.push(`s-maxage=${opts.sMaxAge}`);
  if (opts.stale) cc.push("stale-while-revalidate=604800", "stale-if-error=86400");
  if (cc.length) res.setHeader("Cache-Control", `public, ${cc.join(", ")}`);
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  return res.status(200).send(data);
};

addon.get("/", (_, res) => res.redirect("/configure"));

addon.get("/configure", (req, res) =>
  res.sendFile(path.join(__dirname, "../dist/index.html"))
);

addon.get("/:cfg?/manifest.json", async (req, res) => {
  const manifest = await getManifest(parseConfig(req.params.cfg));
  respond(res, manifest, { sMaxAge: 3600 });
});

addon.get("/:cfg?/catalog/:type/:id/:extra?.json", async (req, res) => {
  const { cfg, type, id } = req.params;
  const params = req.query;
  const config = parseConfig(cfg);
  const language = config.language || DEFAULT_LANGUAGE;
  const page = Math.ceil((Number(params.skip) || 0) / 20) + 1;

  let metas;
  try {
    if (params.search) {
      metas = await cacheWrapCatalog(`search:${type}:${language}:${params.search}`, () =>
        getSearch(type, language, params.search, config)
      );
    } else if (id === "tmdb.trending") {
      metas = await cacheWrapCatalog(`trending:${type}:${language}:${page}:${params.genre || ""}`, () =>
        getTrending(type, language, page, params.genre)
      );
    } else if (id === "tmdb.favorites") {
      metas = await getFavorites(type, language, page, params.genre, config.sessionId);
    } else if (id === "tmdb.watchlist") {
      metas = await getWatchList(type, language, page, params.genre, config.sessionId);
    } else {
      metas = await cacheWrapCatalog(`catalog:${type}:${language}:${id}:${page}:${params.genre || ""}`, () =>
        getCatalog(type, language, page, id, params.genre, config)
      );
    }
  } catch (e) {
    return res.status(404).send(e.message || "Not found");
  }

  respond(res, { metas }, { sMaxAge: 86400, stale: true });
});

addon.get("/:cfg?/meta/:type/:id.json", async (req, res) => {
  const { cfg, type, id } = req.params;
  const config = parseConfig(cfg);
  const language = config.language || DEFAULT_LANGUAGE;
  let tmdbId = id;

  if (!id.startsWith("tmdb:")) {
    const imdb = id.split(":")[0];
    const found = await getTmdb(type, imdb);
    if (!found) return respond(res, { meta: {} });
    tmdbId = `tmdb:${found}`;
  }

  const key = `${language}:${type}:${tmdbId.split(":")[1]}`;
  const data = await cacheWrapMeta(key, () =>
    getMeta(type, language, tmdbId.split(":")[1], config.rpdbkey, {
      hideEpisodeThumbnails: config.hideEpisodeThumbnails === "true"
    })
  );
  respond(res, data, { sMaxAge: 1209600, stale: true });
});

addon.get("/api/image/blur", async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: "Missing image URL" });
  try {
    const buf = await blurImage(url);
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=31536000");
    res.send(buf);
  } catch {
    res.status(500).json({ error: "Processing error" });
  }
});

addon.get("/:cfg?/stream/:type/:id.json", (req, res) =>
  respond(res, { streams: [] }, { sMaxAge: 86400 })
);

module.exports = addon;
