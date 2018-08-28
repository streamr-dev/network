'use strict'

const Libp2pBundle = require('./libp2p-bundle')
const AbstractNode = require('./abstract-node')
const waterfall = require('async/waterfall')
const PeerId = require('peer-id')
const PeerInfo = require('peer-info')
const pull = require('pull-stream')
const { callbackToPromise } = require('./util')

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

        this.createNode(libp2pOptions)
    }

    async createNode(libp2pOptions) {
        let peerInfo

        if (this._privateKey) {
            const idPeer = await callbackToPromise(PeerId.createFromPrivKey, this._privateKey)
            peerInfo = new PeerInfo(idPeer)
        } else {
            peerInfo = await callbackToPromise(PeerInfo.create)
        }

        peerInfo.multiaddrs.add(`/ip4/${this._host}/tcp/${this._port}`)

        this._node = new Libp2pBundle({
            ...libp2pOptions,
            peerInfo: peerInfo
        })

        this._node.handle('/message/', (protocol, conn) =>
            this.handleProtocol(protocol, conn)
        )
        this._node.start((err) => {
            if (err) {
                throw err
            }

            this.emit('node:ready')
        })
    }

    nodeReady() {
        console.log('node has started (true/false):', this._node.isStarted())
        console.log('listening on:')

        this._node.peerInfo.multiaddrs.forEach(ma =>
            console.log(ma.toString())
        )

        this.emit('tracker:running')
        this._node.on('peer:connect', peer => this.connect(peer))
    }

    connect(peer) {
        console.log('Connection established to:', peer.id.toB58String())
    }

    async getPeerInfo(conn) {
        return new Promise((resolve, reject) => {
            return conn.getPeerInfo((err, peerInfo) => {
                return err ? reject(err) : resolve(peerInfo)
            })
        })
    }

    async handleProtocol(protocol, conn) {
        try {
            const peerInfo = await this.getPeerInfo(conn)

            pull(
                conn,
                pull.map(data => data.toString('utf8')),
                pull.drain(data => this.handleMessage(peerInfo, JSON.parse(data)))
            )

        } catch (err) {
            console.log(err)
        }
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