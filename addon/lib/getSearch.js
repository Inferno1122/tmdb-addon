require("dotenv").config();
const { MovieDb } = require("moviedb-promise");
const moviedb = new MovieDb(process.env.TMDB_API);
const { transliterate } = require("transliteration");
const { parseMedia } = require("../utils/parseProps");
const { getGenreList } = require("./getGenreList");

function isNonLatin(text) {
  return /[^\u0000-\u007F]/.test(text);
}

async function getSearch(type, language, query, config) {
  const genreList = await getGenreList(language, type);
  let searchQuery = query;

  if (isNonLatin(query)) {
    searchQuery = transliterate(query);
  }

  const parameters = {
    query,
    language,
    include_adult: config.includeAdult
  };

  if (config.ageRating) {
    parameters.certification_country = "US";
    switch (config.ageRating) {
      case "G":
        parameters.certification = type === "movie" ? "G" : "TV-G";
        break;
      case "PG":
        parameters.certification = type === "movie" ? "G|PG" : "TV-G|TV-PG";
        break;
      case "PG-13":
        parameters.certification = type === "movie" ? "G|PG|PG-13" : "TV-G|TV-PG|TV-14";
        break;
      case "R":
        parameters.certification = type === "movie" ? "G|PG|PG-13|R" : "TV-G|TV-PG|TV-14|TV-MA";
        break;
    }
  }

  if (type === "movie") {
    const results = [];

    await moviedb.searchMovie(parameters).then(res => {
      res.results.forEach(el => results.push(parseMedia(el, "movie", genreList)));
    }).catch(console.error);

    if (!results.length) {
      await moviedb.searchMovie({ query: searchQuery, language, include_adult: config.includeAdult })
        .then(res => {
          res.results.forEach(el => results.push(parseMedia(el, "movie", genreList)));
        }).catch(console.error);
    }

    return results;
  } else {
    const results = [];

    await moviedb.searchTv(parameters).then(res => {
      res.results.forEach(el => results.push(parseMedia(el, "series", genreList)));
    }).catch(console.error);

    if (!results.length) {
      await moviedb.searchTv({ query: searchQuery, language, include_adult: config.includeAdult })
        .then(res => {
          res.results.forEach(el => results.push(parseMedia(el, "series", genreList)));
        }).catch(console.error);
    }

    return results;
  }
}

module.exports = { getSearch };
