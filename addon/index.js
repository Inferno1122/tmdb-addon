const express = require("express");
const path = require("path");
const favicon = require("serve-favicon");
const compression = require("compression");

const addon = express();

addon.use(compression());
addon.use(favicon(path.join(__dirname, "../public/favicon.png")));
addon.use(express.static(path.join(__dirname, "../public")));
addon.use(express.static(path.join(__dirname, "../dist")));

const { getCatalog } = require("./lib/getCatalog");
const { getMeta } = require("./lib/getMeta");
const { getManifest, DEFAULT_LANGUAGE } = require("./lib/getManifest");
const { getSearch } = require("./lib/getSearch");
const { getTrending } = require("./lib/getTrending");
const { getTmdb } = require("./lib/getTmdb");
const { parseConfig } = require("./utils/parseProps");
const { cacheWrapMeta, cacheWrapCatalog } = require("./lib/getCache");

const respond = (res, data, headers = {}) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");
  if (headers.cacheControl) {
    res.setHeader("Cache-Control", headers.cacheControl);
  }
  res.status(200).send(data);
};

addon.get("/", (_, res) => res.redirect("/configure"));
addon.get("/configure", (_, res) =>
  res.sendFile(path.join(__dirname, "../dist/index.html"))
);

addon.get("/:cfg?/manifest.json", async (req, res) => {
  const cfg = req.params.cfg;
  const config = parseConfig(cfg);
  const manifest = await getManifest(config);
  respond(res, manifest, {
    cacheControl: "public, max-age=3600, stale-while-revalidate=604800, stale-if-error=86400"
  });
});

addon.get("/:cfg?/catalog/:type/:id/:extra?.json", async (req, res) => {
  const { cfg, type, id } = req.params;
  const config = parseConfig(cfg);
  const language = config.language || DEFAULT_LANGUAGE;
  const query = new URLSearchParams(req.url.split("?")[1]);
  const skip = parseInt(query.get("skip") || "0");
  const page = Math.ceil(skip / 20) + 1;
  const search = query.get("search");
  const genre = query.get("genre");

  let metas;

  try {
    if (search) {
      metas = await cacheWrapCatalog(`search:${type}:${language}:${search}`, () =>
        getSearch(type, language, search, config)
      );
    } else if (id === "tmdb.trending") {
      metas = await cacheWrapCatalog(`trending:${type}:${language}:${page}:${genre}`, () =>
        getTrending(type, language, page, genre)
      );
    } else {
      metas = await cacheWrapCatalog(`catalog:${type}:${language}:${id}:${page}:${genre}`, () =>
        getCatalog(type, language, page, id, genre, config)
      );
    }
  } catch (err) {
    return res.status(404).send("Not found");
  }

  respond(res, { metas }, {
    cacheControl: "public, max-age=86400, stale-while-revalidate=604800, stale-if-error=86400"
  });
});

addon.get("/:cfg?/meta/:type/:id.json", async (req, res) => {
  const { cfg, type, id } = req.params;
  const config = parseConfig(cfg);
  const language = config.language || DEFAULT_LANGUAGE;
  const tmdbId = id.split(":")[1];

  const data = await cacheWrapMeta(`${language}:${type}:${tmdbId}`, () =>
    getMeta(type, language, tmdbId, config.rpdbkey, {
      hideEpisodeThumbnails: config.hideEpisodeThumbnails === "true"
    })
  );

  respond(res, data, {
    cacheControl: "public, max-age=1209600, stale-while-revalidate=604800, stale-if-error=86400"
  });
});

addon.get("/:cfg?/stream/:type/:id.json", (_, res) => {
  respond(res, { streams: [] }, {
    cacheControl: "public, max-age=86400"
  });
});

module.exports = addon;
