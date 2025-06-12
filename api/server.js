const express = require("express");
const compression = require("compression");
const path = require("path");
const addon = require("../addon/index.js");

const server = express();

server.use(compression());
server.use("/dist", express.static(path.join(__dirname, "../dist")));
server.use("/favicon.png", express.static(path.join(__dirname, "../public/favicon.png")));
server.use("/logo.png", express.static(path.join(__dirname, "../public/logo.png")));
server.use("/background.png", express.static(path.join(__dirname, "../public/background.png")));

server.use(addon);

module.exports = server;
