const { EventEmitter } = require('events')
const PeerId = require('peer-id')
const PeerInfo = require('peer-info')
const pull = require('pull-stream')
const debug = require('debug')('streamr:connection:libp2pendpoint')
const { callbackToPromise, getAddress } = require('../util')
const Libp2pBundle = require('./Libp2pBundle')

const HANDLER = '/streamr/v1/'

const events = Object.freeze({
    PEER_DISCOVERED: 'streamr:peer:discovery',
    PEER_CONNECTED: 'streamr:peer:connect',
    PEER_DISCONNECTED: 'streamr:peer:disconnect',
    MESSAGE_SENT: 'streamr:message-sent',
    MESSAGE_RECEIVED: 'streamr:message-received'
})

class Libp2pEndpoint extends EventEmitter {
    constructor(node) {
        super()
        this.node = node

        node.peerInfo.multiaddrs.forEach((ma) => debug('listening on: %s', ma.toString()))

        node.handle(HANDLER, (protocol, conn) => this.onReceive(protocol, conn))
        node.on('peer:discovery', (peer) => {
            debug('peer %s discovered', getAddress(peer))
            this.emit(events.PEER_DISCOVERED, peer)
        })
        node.on('peer:connect', (peer) => {
            debug('peer %s connected', getAddress(peer))
            this.emit(events.PEER_CONNECTED, peer)
        })
        node.on('peer:disconnect', (peer) => {
            debug('peer %s disconnected', getAddress(peer))
            this.emit(events.PEER_DISCONNECTED, peer)
        })
    }

    send(recipient, message) {
        debug('sending to peer %s message with data "%s"', recipient instanceof PeerInfo ? getAddress(recipient) : '', message)
        this.node.dialProtocol(recipient, HANDLER, (err, conn) => {
            if (err) {
                throw err
            }

            pull(pull.values([message]), conn)

            this.emit(events.MESSAGE_SENT, {
                recipient,
                message
            })
        })
    }

    async onReceive(protocol, conn) {
        try {
            const sender = await Libp2pEndpoint.getPeerInfo(conn)

            pull(
                conn,
                pull.map((message) => message.toString('utf8')),
                pull.drain((message) => {
                    debug('received from peer %s message with data "%s"', sender instanceof PeerInfo ? getAddress(sender) : '', message)

                    this.emit(events.MESSAGE_RECEIVED, {
                        sender,
                        message
                    })
                })
            )
        } catch (err) {
            console.log(err)
        }
    }

    async connect(peerInfo) {
        let address = ''
        if (typeof peerInfo === 'string') {
            address = peerInfo
        } else if (PeerInfo.isPeerInfo(peerInfo)) {
            // peer.id.toB58String()
            address = getAddress(peerInfo)
        } else {
            throw new Error('not valid PeerId or PeerInfo, or B58Str')
        }

        if (!this.isConnected(address)) {
            await this._dial(address)
            debug('connected to %s', address)
        }
    }

    async _dial(address) {
        return new Promise((resolve, reject) => this.node.dial(address, (err, peerInfo) => (err ? reject(err) : resolve(peerInfo))))
    }

    async stop(callback = true) {
        return new Promise((resolve, reject) => this.node.stop((err) => (err ? reject(err) : resolve(callback))))
    }

    isConnected(peerInfo) {
        return this.node.peerBook.has(peerInfo)
    }

    getPeers() {
        return this.node.peerBook.getAllArray()
    }

    static async getPeerInfo(endpoint) {
        return new Promise((resolve, reject) => {
            return endpoint.getPeerInfo((err, peerInfo) => (err ? reject(err) : resolve(peerInfo)))
        })
    }
}

async function createPeerInfo(host, port, privateKey) {
    let peerInfo

    if (privateKey) {
        const idPeer = await callbackToPromise(PeerId.createFromPrivKey, privateKey)
        peerInfo = new PeerInfo(idPeer)
    } else {
        peerInfo = await callbackToPromise(PeerInfo.create)
    }

    peerInfo.multiaddrs.add(`/ip4/${host}/tcp/${port}`)
    return peerInfo
}

async function startLibp2pNode(host, port, privateKey, enablePeerDiscovery, bootstrapNodes) {
    const peerInfo = await createPeerInfo(host, port, privateKey)
    const node = new Libp2pBundle(peerInfo, enablePeerDiscovery, bootstrapNodes)

    return new Promise((resolve, reject) => {
        node.start((err) => {
            if (err) {
                reject(err)
            }
            resolve(node)
        })
    })
}

module.exports = {
    events,
    async createEndpoint(host, port, privateKey, enablePeerDiscovery = false, bootstrapNodes) {
        return startLibp2pNode(host, port, privateKey, enablePeerDiscovery, bootstrapNodes).then((n) => new Libp2pEndpoint(n))
    }
}
