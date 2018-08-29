"use strict";

const Bootstrap = require("libp2p-bootstrap");
const StreamrNode = require("./streamr-node");
const { getStreams } = require("./util");

const debug = require("debug");
const log = debug("strmr:p2p:peer");

const BOOTNODES = require("../bootstrapNodes.json").map(node => {
  return node.full;
});

class Peer extends StreamrNode {
  constructor(options) {
    const libp2pOptions = {
      modules: {
        peerDiscovery: [Bootstrap]
      },
      config: {
        peerDiscovery: {
          bootstrap: {
            interval: 1000,
            enabled: true,
            list: BOOTNODES
          }
        }
      }
    };

    super(options, libp2pOptions);

    this._streams = getStreams();
    console.log(this._streams);
  }

  nodeReady() {
    this._node.on("peer:discovery", peer => this._trackerDiscovery(peer));
    super.nodeReady();
  }

  _trackerDiscovery(peer) {
    console.log("Discovered:", peer.id.toB58String());
    this._node.dial(peer, () => {});
    this._tracker = peer;
  }

  connect(peer) {
    super.connect(peer);
    this.sendStatus();
  }

  sendStatus() {
    this._status = {
      started: new Date().toLocaleString(),
      streams: this._streams
    };

    super.sendMessage(
      StreamrNode.MESSAGE_CODES.STATUS,
      this._tracker,
      this._status
    );
  }
}

module.exports = Peer;
