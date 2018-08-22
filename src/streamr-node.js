'use strict'

const Libp2pBundle = require('./libp2p-bundle')
const AbstractNode = require('./abstract-node')
const waterfall = require('async/waterfall')
const PeerId = require('peer-id')
const PeerInfo = require('peer-info')
const pull = require('pull-stream')

const debug = require('debug')
const log = debug('strmr:p2p:streamr-node')

const MESSAGE_CODES = {
    STATUS: 0x00,
    PEERS: 0x01,
    DATA: 0x02
}

class StreamrNode extends AbstractNode {
    constructor(options, libp2pOptions = {}) {
        super()

        this._host = options.host || '0.0.0.0'
        this._port = options.port || 0
        this._privateKey = options.privateKey || ''
        this._status = null

        let node
        waterfall(
            [
                cb =>
                (this._privateKey ?
                    PeerId.createFromPrivKey(this._privateKey, cb) :
                    cb(null, null)),
                (idPeer, cb) => {
                    if (this._privateKey) {
                        const peerInfo = new PeerInfo(idPeer)
                        cb(null, peerInfo)
                    } else {
                        PeerInfo.create(cb)
                    }
                },
                (peerInfo, cb) => {
                    peerInfo.multiaddrs.add(`/ip4/${this._host}/tcp/${this._port}`)

                    node = new Libp2pBundle({
                        ...libp2pOptions,
                        peerInfo: peerInfo
                    })
                    this._node = node

                    node.handle('/message/', (protocol, conn) =>
                        this.handleProtocol(protocol, conn)
                    )
                    node.start(cb)
                }
            ],
            err => {
                if (err) {
                    throw err
                }

                console.log('node has started (true/false):', this._node.isStarted())
                console.log('listening on:')

                this._node.peerInfo.multiaddrs.forEach(ma =>
                    console.log(ma.toString())
                )

                this._node.on('peer:discovery', peer => this._trackerDiscovery(peer))
                this._node.on('peer:connect', peer => this._connectPeer(peer))
            }
        )
    }

    _trackerDiscovery(peer) {}

    _connectPeer(peer) {
        console.log('Connection established to:', peer.id.toB58String())
    }

    handleProtocol(protocol, conn) {
        let id = null
        
        waterfall(
            [
                cb => conn.getPeerInfo(cb),
                (peerInfo, cb) => {
                    pull(
                        conn,
                        pull.map(data => data.toString('utf8')),
                        pull.drain(data => this.handleMessage(peerInfo, JSON.parse(data)))
                    )
                }
            ],
            err => {
                if (err) {
                    throw err
                }
            }
        )
    }

    handleMessage(peerInfo, message) {
        const code = message.code

        switch (code) {
            case MESSAGE_CODES.STATUS:
                this.emit('peer:status', {
                    peerInfo: peerInfo,
                    status: message.msg
                })
                break

            case MESSAGE_CODES.PEERS:
                message.msg.forEach(peerInfo => {
                    peerInfo.multiaddrs._multiaddrs.forEach(ma =>
                        console.log(ma.buffer.data.toString())
                    )
                })
                break

            case MESSAGE_CODES.DATA:
                break
        }
    }

    sendMessage(code, recipient, data) {
        let msg = {
            code: code,
            msg: data
        }

        this._node.dialProtocol(recipient, '/message/', (err, conn) => {
            if (err) {
                throw err
            }

            pull(pull.values([JSON.stringify(msg)]), conn)
        })
    }
}

StreamrNode.MESSAGE_CODES = MESSAGE_CODES

module.exports = StreamrNode