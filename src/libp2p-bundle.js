"use strict";

const libp2p = require("libp2p");

const TCP = require("libp2p-tcp");
const WS = require("libp2p-websockets");
const SPDY = require("libp2p-spdy");
const SECIO = require("libp2p-secio");
const defaultsDeep = require("defaults-deep");

class Libp2pBundle extends libp2p {
  constructor(options) {
    const defaults = {
      modules: {
        transport: [TCP, WS],
        connEncryption: [SECIO],
        streamMuxer: [SPDY]
      }
    };

    super(defaultsDeep(options, defaults));
  }
}

module.exports = Libp2pBundle;
