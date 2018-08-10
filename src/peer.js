'use strict'

const libp2p = require('libp2p')

const TCP = require('libp2p-tcp')
const WS = require('libp2p-websockets')
const Bootstrap = require('libp2p-railing')
const Mplex = require('libp2p-mplex')
const SECIO = require('libp2p-secio')

const PeerInfo = require('peer-info')
const waterfall = require('async/waterfall')
const defaultsDeep = require('defaults-deep')
const PeerId = require('peer-id')
const EventEmitter = require('events').EventEmitter
const util = require('./util')

const BOOTNODES = require('../bootstrapNodes.json').map((node) => {
    return node.full
})

class StreamrNode extends libp2p {
    constructor(options) {
        const defaults = {
            modules: {
                transport: [TCP, WS],
                connEncryption: [SECIO],
                streamMuxer: [Mplex]
            }
        }

        super(defaultsDeep(options, defaults))
    }
}

class Node extends EventEmitter {
    constructor(options, libp2pOptions = {}) {
        super()

        this._host = options.host || '0.0.0.0'
        this._port = options.port || 0

        let node
        waterfall([
            (cb) => PeerInfo.create(cb),
            (peerInfo, cb) => {
                peerInfo.multiaddrs.add(`/ip4/${this._host}/tcp/${this._port}`)

                node = new StreamrNode({
                    ...libp2pOptions,
                    peerInfo: peerInfo
                })
                this._node = node
                node.start(cb)
            }
        ], (err) => {
            if (err) {
                throw err
            }

            console.log('node has started (true/false):', this._node.isStarted())
            console.log('listening on:')

            this._node.peerInfo.multiaddrs.forEach((ma) => console.log(ma.toString()))

            this._node.on('peer:discovery', (peer) => this._trackerDiscovery(peer))
            this._node.on('peer:connect', (peer) => this._connectPeer(peer))
        })
    }

    _trackerDiscovery(peer) {}

    _connectPeer(peer) {
        console.log('Connection established to:', peer.id.toB58String())
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
                        interval: 1,
                        enabled: true,
                        list: BOOTNODES
                    }
                }
            }
        }

        super(options, libp2pOptions)
    }

    _trackerDiscovery(peer) {
        console.log('Discovered:', peer.id.toB58String())
        this._node.dial(peer, () => {})
    }
}

module.exports = {
    Node,
    Peer
};