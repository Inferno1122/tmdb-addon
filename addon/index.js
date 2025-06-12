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
const { getRequestToken, getSessionId } = require("./lib/getSession");
const { getFavorites, getWatchList } = require("./lib/getPersonalLists");
const { parseConfig, getRpdbPoster, checkIfExists } = require("./utils/parseProps");
const { blurImage } = require("./utils/imageProcessor");
const { cacheWrapMeta } = require("./lib/getCache");

const addon = express();

addon.use(compression());
addon.use(analytics.middleware);
addon.use(express.static(path.join(__dirname, "../public")));
addon.use(express.static(path.join(__dirname, "../dist")));

const respond = (res, data, opts = {}) => {
  const cc = [];
  if (opts.sMaxAge) cc.push(`s-maxage=${opts.sMaxAge}`);
  if (opts.stale) cc.push("stale-while-revalidate=604800", "stale-if-error=86400");
  if (cc.length) res.setHeader("Cache-Control", `public, ${cc.join(", ")}`);
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.status(200).send(data);
};

addon.get("/", (_, res) => {
  res.redirect("/configure");
});

addon.get("/configure", (req, res) => {
  res.sendFile(path.join(__dirname, "../dist/index.html"));
});

addon.get("/request_token", async (req, res) => {
  const requestToken = await getRequestToken();
  respond(res, requestToken);
});

addon.get("/session_id", async (req, res) => {
  const sessionId = await getSessionId(req.query.request_token);
  respond(res, sessionId);
});

addon.get("/:cfg?/manifest.json", async (req, res) => {
  const config = parseConfig(req.params.cfg);
  const manifest = await getManifest(config);
  respond(res, manifest, { sMaxAge: 3600 });
});

addon.get("/:cfg?/catalog/:type/:id/:extra?.json", async (req, res) => {
  const { cfg, type, id, extra } = req.params;
  const config = parseConfig(cfg);
  const language = config.language || DEFAULT_LANGUAGE;
  const urlParams = new URL(req.url, "http://x").searchParams;
  const skip = urlParams.get("skip") || 0;
  const search = urlParams.get("search");
  const genre = urlParams.get("genre");
  const page = Math.ceil(skip / 20) + 1 || 1;

  let metas = [];

  try {
    if (search) {
      metas = await getSearch(type, language, search, config);
    } else {
      switch (id) {
        case "tmdb.trending":
          metas = await getTrending(type, language, page, genre);
          break;
        case "tmdb.favorites":
          metas = await getFavorites(type, language, page, genre, config.sessionId);
          break;
        case "tmdb.watchlist":
          metas = await getWatchList(type, language, page, genre, config.sessionId);
          break;
        default:
          metas = await getCatalog(type, language, page, id, genre, config);
          break;
      }
    }
  } catch (e) {
    return res.status(404).send((e || {}).message || "Not found");
  }

  respond(res, { metas }, { sMaxAge: 86400, stale: true });
});

addon.get("/:cfg?/meta/:type/:id.json", async (req, res) => {
  const { cfg, type, id } = req.params;
  const config = parseConfig(cfg);
  const language = config.language || DEFAULT_LANGUAGE;
  const tmdbId = id.split(":")[1];
  const imdbId = id.split(":")[0];

  if (id.startsWith("tmdb:")) {
    const data = await cacheWrapMeta(`${language}:${type}:${tmdbId}`, async () => {
      return await getMeta(type, language, tmdbId, config.rpdbkey, {
        hideEpisodeThumbnails: config.hideEpisodeThumbnails === "true"
      });
    });
    return respond(res, data, { sMaxAge: 1209600, stale: true });
  }

  if (id.startsWith("tt")) {
    const tmdbId = await getTmdb(type, imdbId);
    if (!tmdbId) return respond(res, { meta: {} });
    const data = await cacheWrapMeta(`${language}:${type}:${tmdbId}`, async () => {
      return await getMeta(type, language, tmdbId, config.rpdbkey, {
        hideEpisodeThumbnails: config.hideEpisodeThumbnails === "true"
      });
    });
    return respond(res, data, { sMaxAge: 1209600, stale: true });
  }

  respond(res, { meta: {} });
});

addon.get("/api/image/blur", async (req, res) => {
  const imageUrl = req.query.url;
  if (!imageUrl) return res.status(400).json({ error: "Missing image URL" });

  try {
    const buffer = await blurImage(imageUrl);
    if (!buffer) return res.status(500).json({ error: "Processing error" });
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=31536000");
    res.send(buffer);
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

addon.get("/:cfg?/stream/:type/:id.json", (req, res) => {
  respond(res, { streams: [] }, { sMaxAge: 86400 });
});

module.exports = addon;
