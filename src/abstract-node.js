"use strict";

const EventEmitter = require("events").EventEmitter;

class AbstractNode extends EventEmitter {
  constructor() {
    super();

        this._version = null;
        this._status = null;
        this._privateKey = null;
        this._port = null;
        this._host = null;
        this._node = null;

        this.once("node:ready", () => this.nodeReady());
    }

  _handleProtocol(protocol, conn) {}

  _handleMessage(peerInfo, message) {}

  _handleStatus() {}

  sendMessage(code, recipient, data) {}

  sendStatus(status) {}

  getCodeDescription(code) {}

  nodeReady() {}

  connect(peer) {}
}

module.exports = AbstractNode;
