const libp2p = require('libp2p')

const debug = require('debug')('streamr:connection:libp2p')
const TCP = require('libp2p-tcp')
const WS = require('libp2p-websockets')
const SPDY = require('libp2p-spdy')
const SECIO = require('libp2p-secio')
const defaultsDeep = require('defaults-deep')
const Bootstrap = require('libp2p-bootstrap')
const { BOOTNODES } = require('../util')

const libp2pNodeOptions = (bootstrapNodes) => ({
    modules: {
        peerDiscovery: [Bootstrap]
    },
    config: {
        peerDiscovery: {
            bootstrap: {
                interval: 5000,
                enabled: true,
                list: bootstrapNodes
            }
        }
    }
})

module.exports = class Libp2pBundle extends libp2p {
    constructor(peerInfo, enablePeerDiscovery = false, bootstrapNodes = BOOTNODES) {
        const defaults = {
            modules: {
                transport: [TCP, WS],
                connEncryption: [SECIO],
                streamMuxer: [SPDY]
            }
        }

        const params = !enablePeerDiscovery ? {
            peerInfo
        } : {
            ...libp2pNodeOptions(bootstrapNodes),
            peerInfo
        }

        super(defaultsDeep(params, defaults))

        debug('libp2p bundle created with %s', enablePeerDiscovery ? `boostrap nodes ${bootstrapNodes}`
            : 'no peer discovery')
    }
}
