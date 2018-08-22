'use strict'

const EventEmitter = require("events").EventEmitter

class AbstractNode extends EventEmitter {
    _trackerDiscovery(peer) {}

    _connectPeer(peer) {}

    handleProtocol(protocol, conn) {}

    handleMessage(peerInfo, message) {}

    sendMessage(code, recipient, data) {}
}

module.exports = AbstractNode