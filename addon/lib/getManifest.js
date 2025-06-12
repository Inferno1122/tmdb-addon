require("dotenv").config();
const { getGenreList } = require("./getGenreList");
const { getLanguages } = require("./getLanguages");
const { getGenresFromMDBList } = require("../utils/mdbList");
const packageJson = require("../../package.json");

const DEFAULT_LANGUAGE = 'en';

const getManifest = async (config) => {
  const language = config.language || DEFAULT_LANGUAGE;
  const provideImdbId = config.imdbIds === "true";

  const catalogsTranslations = getLanguageTranslations(language).catalogs;
  const defaultTranslations = getLanguageTranslations('en');
  const translatedCatalogs = { ...defaultTranslations.catalogs, ...catalogsTranslations };

  let catalogs = [];
  const tmdbPrefix = config.tmdbPrefix ? config.tmdbPrefix + " " : "";

  const genres = await getGenresFromMDBList(config.mdblistkey);
  const translations = getLanguageTranslations(language);
  const genreTranslations = translations.genres || defaultTranslations.genres;

  const genreOptions = Object.keys(genreTranslations).map((g) => ({
    id: g,
    name: genreTranslations[g],
  }));

  const defaultYears = ["2023", "2022", "2021", "2020", "2019", "2018"];
  const defaultLanguageOptions = Object.entries(getLanguages())
    .map(([code, info]) => ({ id: code, name: info.name }));

  catalogs.push(
    getCatalogDefinition(`${tmdbPrefix}${translatedCatalogs.movies.popular}`, 'movie', {
      extra: ["genre", "search", "skip"],
      defaultOptions: genres.movies,
      extraSupported: ["genre", "search", "skip", "rpdb"],
      showInHome: true
    }),
    getCatalogDefinition(`${tmdbPrefix}${translatedCatalogs.movies.trending}`, 'movie', {
      id: "tmdb.trending",
      extra: ["genre", "search", "skip"],
      defaultOptions: genres.movies,
      extraSupported: ["genre", "search", "skip", "rpdb"],
      showInHome: false
    }),
    getCatalogDefinition(`${tmdbPrefix}${translatedCatalogs.movies.year}`, 'movie', {
      id: "tmdb.year",
      extra: ["genre", "search", "skip"],
      defaultOptions: defaultYears,
      extraSupported: ["genre", "search", "skip", "rpdb"],
      showInHome: false
    }),
    getCatalogDefinition(`${tmdbPrefix}${translatedCatalogs.movies.language}`, 'movie', {
      id: "tmdb.language",
      extra: ["genre", "search", "skip"],
      defaultOptions: defaultLanguageOptions,
      extraSupported: ["genre", "search", "skip", "rpdb"],
      showInHome: false
    }),
    getCatalogDefinition(`${tmdbPrefix}${translatedCatalogs.series.popular}`, 'series', {
      extra: ["genre", "search", "skip"],
      defaultOptions: genres.series,
      extraSupported: ["genre", "search", "skip", "rpdb"],
      showInHome: true
    }),
    getCatalogDefinition(`${tmdbPrefix}${translatedCatalogs.series.trending}`, 'series', {
      id: "tmdb.trending",
      extra: ["genre", "search", "skip"],
      defaultOptions: genres.series,
      extraSupported: ["genre", "search", "skip", "rpdb"],
      showInHome: false
    }),
    getCatalogDefinition(`${tmdbPrefix}${translatedCatalogs.series.year}`, 'series', {
      id: "tmdb.year",
      extra: ["genre", "search", "skip"],
      defaultOptions: defaultYears,
      extraSupported: ["genre", "search", "skip", "rpdb"],
      showInHome: false
    }),
    getCatalogDefinition(`${tmdbPrefix}${translatedCatalogs.series.language}`, 'series', {
      id: "tmdb.language",
      extra: ["genre", "search", "skip"],
      defaultOptions: defaultLanguageOptions,
      extraSupported: ["genre", "search", "skip", "rpdb"],
      showInHome: false
    })
  );

  if (config.searchEnabled !== "false") {
    const searchCatalogMovie = {
      id: "tmdb.search",
      type: "movie",
      name: `${tmdbPrefix}${translatedCatalogs.search}`,
      extra: [{ name: "search", isRequired: true, options: [] }]
    };
    const searchCatalogTv = {
      id: "tmdb.search.series",
      type: "series",
      name: `${tmdbPrefix}${translatedCatalogs.search} (${translatedCatalogs.series.name})`,
      extra: [{ name: "search", isRequired: true, options: [] }]
    };
    catalogs.push(searchCatalogMovie, searchCatalogTv);
  }

  const manifest = {
    id: packageJson.name,
    version: packageJson.version,
    name: packageJson.name,
    description: packageJson.description,
    icon: `${process.env.HOST_NAME}/favicon.png`,
    background: `${process.env.HOST_NAME}/background.png`,
    logo: `${process.env.HOST_NAME}/logo.png`,
    resources: ["catalog", "meta", "stream", "manifest"],
    types: ["movie", "series"],
    idPrefixes: ["tt", "tmdb"],
    catalogs: catalogs,
    configurationRequired: false
  };
  return manifest;
};

module.exports = { getManifest, DEFAULT_LANGUAGE };
