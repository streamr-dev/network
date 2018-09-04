const Buffer = require('safe-buffer').Buffer
const pVersion = require('../../package.json').version
const os = require('os')
const ms = require('ms')
const StreamrNode = require('../protocol/streamr-node')

const {
    validate
} = require('../validation')

const {
    getAddress
} = require('../util')

const debug = require('debug')
const log = debug('strmr:p2p:tracker')

class Tracker extends StreamrNode {
    constructor(options) {
        super(options)

        this._timeout = options.timeout || ms('10s')
        this._peers = new Map()

        this._clientId = Buffer.from(
            options.clientId ||
            `strmr-net/v${pVersion}/${os.platform()}-${os.arch()}/nodejs`,
        )
        this._remoteClientIdFilter = options.remoteClientIdFilter

        this.on('peer:status', peer => this._handlePeerStatus(peer))
        this.on('peer:send-peers', peer => this._sendPeers(peer))

        log(`tracker started at ${this._host}:${this._port}`)
    }

    getPeers() {
        return [...this._peers]
    }

    getPeersAndStreams() {
        return this._peers
    }

    _getRandomPeers(peerAddress) {
        const peers = this._peers
        return [...peers.keys()].filter(k => k !== peerAddress) // randomize
    }

    _handlePeerStatus(peer) {
        const peerInfo = peer.peerInfo
        const status = validate('status', peer.status)

        this._peers.set(getAddress(peerInfo), status)

        this._sendPeers(peerInfo)
    }

    _sendPeers(peerInfo) {
        console.log('sending peers')

        console.log(this._getRandomPeers(getAddress(peerInfo)))

        super.sendMessage(
            StreamrNode.MESSAGE_CODES.PEERS,
            peerInfo,
            this._getRandomPeers(getAddress(peerInfo)),
        )
    }
}

module.exports = Tracker
