const Libp2pBundle = require('../connection/libp2p-bundle')
const AbstractNode = require('../connection/abstract-node')
const waterfall = require('async/waterfall')
const PeerId = require('peer-id')
const PeerInfo = require('peer-info')
const pull = require('pull-stream')

const {
    callbackToPromise,
    buildMessage,
    getAddress
} = require('../util')

const {
    validate
} = require("../validation")

const ms = require('ms')

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

        this.on('peer:recieved', peers => this._connectPeers(peers))
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

        console.log("\n\n\n")

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

    _connectPeers(peers) {
        console.log('Connecting new peers')
        peers.forEach(peer => {
            console.log('Connecting to the node: ' + peer)
            this._node.dial(peer, () => {})
        });
    }

    handleMessage(peerInfo, message) {
        message = validate('message', message);
        const code = message.code

        console.log(`Recieved message "${this.getMsgPrefix(code)}" from ${getAddress(peerInfo)}`);

        switch (code) {
            case MESSAGE_CODES.STATUS:
                this.emit('peer:status', {
                    peerInfo: peerInfo,
                    status: message.msg
                })
                break

            case MESSAGE_CODES.PEERS:
                const peers = message.msg

                // ask tacker again
                if (!peers.length && this._tracker) {
                    console.log('No available peers, ask again tracker');

                    setTimeout(() => {
                        console.log('send message')
                        this.sendMessage(MESSAGE_CODES.PEERS, this._tracker, [])
                    }, ms('10s'))
                } else if (peers.length) {
                    console.log('Recieved peers ' + peers);
                    this.emit('peer:recieved', peers)
                }
                // send random peers to the node
                else {
                    this.emit('peer:send-peers', peerInfo);
                }

                break

            case MESSAGE_CODES.DATA:
                break
        }
    }

    sendMessage(code, recipient, data) {
        console.log(`Send message type ${this.getMsgPrefix(code)} to ${getAddress(recipient)}`);

        this._node.dialProtocol(recipient, '/message/', (err, conn) => {
            if (err) {
                throw err
            }

            pull(pull.values([buildMessage(code, data)]), conn)
        })
    }

    getNodes() {
        return this._node.peerBook.getAllArray();
    }

    getMsgPrefix(msgCode) {
        return Object.keys(MESSAGE_CODES).find(key => MESSAGE_CODES[key] === msgCode)
    }
}

StreamrNode.MESSAGE_CODES = MESSAGE_CODES

module.exports = StreamrNode