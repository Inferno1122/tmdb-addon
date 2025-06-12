const express = require("express");
const favicon = require("serve-favicon");
const path = require("path");
const addon = express();
const analytics = require("./utils/analytics");
const { getCatalog } = require("./lib/getCatalog");
const { getSearch } = require("./lib/getSearch");
const { getManifest, DEFAULT_LANGUAGE } = require("./lib/getManifest");
const { getMeta } = require("./lib/getMeta");
const { getTmdb } = require("./lib/getTmdb");
const { cacheWrapMeta } = require("./lib/getCache");
const { getTrending } = require("./lib/getTrending");
const { parseConfig, getRpdbPoster, checkIfExists } = require("./utils/parseProps");
const { getRequestToken, getSessionId } = require("./lib/getSession");
const { getFavorites, getWatchList } = require("./lib/getPersonalLists");
const { blurImage } = require("./utils/imageProcessor");

const safeParseConfig = (input) => {
  try {
    if (!input) return {};
    return JSON.parse(decodeURIComponent(input));
  } catch (e) {
    return {};
  }
};

addon.use(analytics.middleware);
addon.use(favicon(path.join(__dirname, "../public/favicon.png")));
addon.use(express.static(path.join(__dirname, "../public")));
addon.use(express.static(path.join(__dirname, "../dist")));

const getCacheHeaders = (opts = {}) => {
  const headers = {
    cacheMaxAge: "max-age",
    staleRevalidate: "stale-while-revalidate",
    staleError: "stale-if-error",
  };
  return Object.keys(headers)
    .map((key) => opts[key] ? `${headers[key]}=${opts[key]}` : null)
    .filter(Boolean)
    .join(", ");
};

const respond = (res, data, opts = {}) => {
  const cacheControl = getCacheHeaders(opts);
  if (cacheControl) res.setHeader("Cache-Control", `${cacheControl}, public`);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Content-Type", "application/json");
  res.send(data);
};

addon.get("/", (_, res) => res.redirect("/configure"));

addon.get("/configure", (_, res) =>
  res.sendFile(path.join(__dirname, "../dist/index.html"))
);

addon.get("/request_token", async (req, res) => {
  const token = await getRequestToken();
  respond(res, token);
});

addon.get("/session_id", async (req, res) => {
  const sessionId = await getSessionId(req.query.request_token);
  respond(res, sessionId);
});

addon.get("/:catalogChoices?/manifest.json", async (req, res) => {
  const config = safeParseConfig(req.params.catalogChoices);
  const manifest = await getManifest(config);
  respond(res, manifest, {
    cacheMaxAge: 43200,
    staleRevalidate: 1209600,
    staleError: 2592000,
  });
});

addon.get("/:catalogChoices?/catalog/:type/:id/:extra?.json", async (req, res) => {
  const { catalogChoices, type, id } = req.params;
  const config = safeParseConfig(catalogChoices);
  const language = config.language || DEFAULT_LANGUAGE;
  const rpdbkey = config.rpdbkey;
  const sessionId = config.sessionId;
  const search = req.query.search;
  const genre = req.query.genre;
  const skip = parseInt(req.query.skip || "0");
  const page = Math.ceil(skip / 20) + 1;
  let metas = [];

  try {
    const args = [type, language, page];
    if (search) {
      const searchResults = await getSearch(type, language, search, config);
      metas = searchResults.metas || [];
    } else {
      switch (id) {
        case "tmdb.trending":
          metas = await getTrending(...args, genre);
          break;
        case "tmdb.favorites":
          metas = await getFavorites(...args, genre, sessionId);
          break;
        case "tmdb.watchlist":
          metas = await getWatchList(...args, genre, sessionId);
          break;
        default:
          metas = await getCatalog(...args, id, genre, config);
          break;
      }
    }
  } catch (e) {
    return res.status(404).send(e.message || "Not found");
  }

  if (rpdbkey) {
    try {
      metas = JSON.parse(JSON.stringify(metas));
      metas = await Promise.all(
        metas.map(async (el) => {
          const rpdbImage = getRpdbPoster(type, el.id.replace("tmdb:", ""), language, rpdbkey);
          el.poster = (await checkIfExists(rpdbImage)) ? rpdbImage : el.poster;
          return el;
        })
      );
    } catch {}
  }

  respond(res, { metas }, {
    cacheMaxAge: 86400,
    staleRevalidate: 604800,
    staleError: 1209600,
  });
});

addon.get("/:catalogChoices?/meta/:type/:id.json", async (req, res) => {
  const { catalogChoices, type, id } = req.params;
  const config = safeParseConfig(catalogChoices);
  const language = config.language || DEFAULT_LANGUAGE;
  const rpdbkey = config.rpdbkey;
  const imdbId = id.split(":")[0];
  const tmdbId = id.split(":")[1];

  const cacheOpts = {
    staleRevalidate: 1728000,
    staleError: 2592000,
    cacheMaxAge: type === "movie" ? 1209600 : 86400,
  };

  if (id.includes("tmdb:")) {
    const resp = await cacheWrapMeta(`${language}:${type}:${tmdbId}`, () =>
      getMeta(type, language, tmdbId, rpdbkey, {
        hideEpisodeThumbnails: config.hideEpisodeThumbnails === "true",
      })
    );
    return respond(res, resp, cacheOpts);
  }

  if (id.includes("tt")) {
    const resolved = await getTmdb(type, imdbId);
    if (resolved) {
      const resp = await cacheWrapMeta(`${language}:${type}:${resolved}`, () =>
        getMeta(type, language, resolved, rpdbkey, {
          hideEpisodeThumbnails: config.hideEpisodeThumbnails === "true",
        })
      );
      return respond(res, resp, cacheOpts);
    }
    return respond(res, { meta: {} });
  }

  respond(res, { meta: {} });
});

addon.get("/api/image/blur", async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: "Missing image URL" });

  try {
    const buf = await blurImage(url);
    if (!buf) return res.status(500).json({ error: "Image processing failed" });
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=31536000");
    res.send(buf);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

addon.get("/:catalogChoices?/stream/:type/:id.json", (req, res) => {
  respond(res, { streams: [] }, {
    cacheMaxAge: 86400,
    staleRevalidate: 604800,
    staleError: 1209600,
  });
});

module.exports = addon;
