const express = require("express");
const compression = require("compression");
const addon = require("../addon/index.js");
const server = express();

server.use(compression());
server.use("/dist", express.static("dist"));
server.use("/favicon.png", express.static("public/favicon.png"));


server.use(addon);

module.exports = server;
