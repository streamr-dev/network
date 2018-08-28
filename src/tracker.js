"use strict";

const Buffer = require("safe-buffer").Buffer;
const pVersion = require("../package.json").version;
const os = require("os");
const ms = require("ms");
const StreamrNode = require("./streamr-node");

const debug = require("debug");
const log = debug("strmr:p2p:tracker");

class Tracker extends StreamrNode {
  constructor(options) {
    super(options);

    this._timeout = options.timeout || ms("10s");
    this._peers = new Map();

    this._clientId = Buffer.from(
      options.clientId ||
        `strmr-net/v${pVersion}/${os.platform()}-${os.arch()}/nodejs`
    );
    this._remoteClientIdFilter = options.remoteClientIdFilter;
    this.on("peer:status", peer => this._handlePeerStatus(peer));

    log(`tracker started at ${this._host}:${this._port}`);
  }

  getPeers() {
    return this._node.peerBook.getAllArray();
  }

  getPeersAndStreams() {
    return this._peers;
  }

  _getRandomPeers() {
    return this._node.peerBook.getAllArray();
  }

  _handlePeerStatus(peer) {
    const peerInfo = peer.peerInfo;
    const status = peer.status;
    this._peers.set(peerInfo.id.toB58String(), status);

    this._sendPeers(peer);
  }

  _sendPeers(peer) {
    console.log("sending peers");
    super.sendMessage(
      StreamrNode.MESSAGE_CODES.PEERS,
      peer.peerInfo,
      this._getRandomPeers()
    );
  }
}

module.exports = Tracker;
