"use strict";

const libp2p = require("libp2p");

const TCP = require("libp2p-tcp");
const WS = require("libp2p-websockets");
const Bootstrap = require("libp2p-railing");
const Mplex = require("libp2p-mplex");
const SECIO = require("libp2p-secio");
const PeerId = require("peer-id");
const PeerInfo = require("peer-info");

const waterfall = require("async/waterfall");
const defaultsDeep = require("defaults-deep");
const EventEmitter = require("events").EventEmitter;

const pull = require("pull-stream");

const STRMR = require("./protocol");

const BOOTNODES = require("../bootstrapNodes.json").map(node => {
    return node.full;
});

class StreamrNode extends libp2p {
    constructor(options) {
        const defaults = {
            modules: {
                transport: [TCP, WS],
                connEncryption: [SECIO],
                streamMuxer: [Mplex]
            }
        };

        super(defaultsDeep(options, defaults));
    }
}

class Node extends EventEmitter {
    constructor(options, libp2pOptions = {}) {
        super();

        this._host = options.host || "0.0.0.0";
        this._port = options.port || 0;
        this._privateKey = options.privateKey || "";
        this._status = null;

        let node;
        waterfall(
            [
                cb =>
                (this._privateKey ?
                    PeerId.createFromPrivKey(this._privateKey, cb) :
                    cb(null, null)),
                (idPeer, cb) => {
                    if (this._privateKey) {
                        const peerInfo = new PeerInfo(idPeer);
                        cb(null, peerInfo);
                    } else {
                        PeerInfo.create(cb);
                    }
                },
                (peerInfo, cb) => {
                    peerInfo.multiaddrs.add(`/ip4/${this._host}/tcp/${this._port}`);

                    node = new StreamrNode({
                        ...libp2pOptions,
                        peerInfo: peerInfo
                    });
                    this._node = node;

                    node.handle("/message/", (protocol, conn) =>
                        this.handleProtocol(protocol, conn)
                    );
                    node.start(cb);
                }
            ],
            err => {
                if (err) {
                    throw err;
                }

                console.log("node has started (true/false):", this._node.isStarted());
                console.log("listening on:");

                this._node.peerInfo.multiaddrs.forEach(ma =>
                    console.log(ma.toString())
                );

                this._node.on("peer:discovery", peer => this._trackerDiscovery(peer));
                this._node.on("peer:connect", peer => this._connectPeer(peer));
            }
        );
    }

    _trackerDiscovery(peer) {}

    _connectPeer(peer) {
        console.log("Connection established to:", peer.id.toB58String());
    }

    handleProtocol(protocol, conn) {
        let id = null
        
        waterfall(
            [
                cb => conn.getPeerInfo(cb),
                (peerInfo, cb) => {
                    pull(
                        conn,
                        pull.map(data => data.toString("utf8")),
                        pull.drain(data => this.handleMessage(peerInfo, JSON.parse(data)))
                    )
                }
            ],
            err => {
                if (err) {
                    throw err;
                }
            }
        )
    }

    handleMessage(peerInfo, message) {
        const code = message.code;

        switch (code) {
            case STRMR.MESSAGE_CODES.STATUS:
                this.emit("peer:status", {
                    peerInfo: peerInfo,
                    status: message.msg
                })
                break;

            case STRMR.MESSAGE_CODES.PEERS:
                message.msg.forEach(peerInfo => {
                    peerInfo.multiaddrs._multiaddrs.forEach(ma =>
                        console.log(ma.buffer.data.toString())
                    );
                });
                break;

            case STRMR.MESSAGE_CODES.DATA:
                break;
        }
    }

    sendMessage(code, recipient, data) {
        let msg = {
            code: code,
            msg: data
        };

        this._node.dialProtocol(recipient, "/message/", (err, conn) => {
            if (err) {
                throw err;
            }

            pull(pull.values([JSON.stringify(msg)]), conn);
        });
    }
}

class Peer extends Node {
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
    }

    _trackerDiscovery(peer) {
        console.log("Discovered:", peer.id.toB58String());
        this._node.dial(peer, () => {});
        this._tracker = peer;
    }

    _connectPeer(peer) {
        super._connectPeer(peer);
        this.sendStatus();
    }

    sendStatus() {
        this._status = {
            started: new Date().toLocaleString(),
            streams: ["stream" + Math.floor(Math.random() * 100), "stream" + Math.floor(Math.random()) * 100]
        }
            
        super.sendMessage(STRMR.MESSAGE_CODES.STATUS, this._tracker, this._status);
    }
}

module.exports = {
    Node,
    Peer
};