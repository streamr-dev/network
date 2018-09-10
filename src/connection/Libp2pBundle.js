const libp2p = require('libp2p')

const TCP = require('libp2p-tcp')
const WS = require('libp2p-websockets')
const SPDY = require('libp2p-spdy')
const SECIO = require('libp2p-secio')
const Bootstrap = require('libp2p-bootstrap')
const BOOTNODES = require('../util').BOOTNODES

const defaultsDeep = require('defaults-deep')

const libp2pNodeOptions = {
    modules: {
        peerDiscovery: [Bootstrap]
    },
    config: {
        peerDiscovery: {
            bootstrap: {
                interval: 5000,
                enabled: true,
                list: BOOTNODES
            }
        },
        EXPERIMENTAL: {
            pubsub: true
        }
    }
}

module.exports = class Libp2pBundle extends libp2p {
    constructor(peerInfo, includeNodeOptions = false) {
        const defaults = {
            modules: {
                transport: [TCP],
                connEncryption: [SECIO],
                streamMuxer: [SPDY]
            }
        }

        const params = !includeNodeOptions ? {
            peerInfo: peerInfo
        } : {
            ...libp2pNodeOptions,
            peerInfo: peerInfo
        }

        super(defaultsDeep(params, defaults))
    }
}
