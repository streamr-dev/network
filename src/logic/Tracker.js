const { EventEmitter } = require('events')
const debug = require('debug')('streamr:tracker')
const { generateClientId, getAddress } = require('../util')
const TrackerServer = require('../protocol/TrackerServer')
const { getPeersTopology } = require('../helpers/TopologyStrategy')
const encoder = require('../helpers/MessageEncoder')

module.exports = class Tracker extends EventEmitter {
    constructor(connection) {
        super()

        this.connection = connection
        this.peers = new Map()
        this.trackerId = generateClientId('tracker')
        this.listners = {
            trackerServerListner: new TrackerServer(this.connection)
        }

        this.connection.once('node:ready', () => this.trackerReady())
        this.listners.trackerServerListner.on('streamr:tracker:find-stream', ({ sender, streamId }) => {
            this.findStream(sender, streamId)
        })
        this.listners.trackerServerListner.on('streamr:tracker:send-peers', (peer) => this.sendPeers(peer))
        this.listners.trackerServerListner.on('streamr:tracker:peer-status', ({ peer, status }) => {
            this.statusPeer(peer, status)
        })
    }

    trackerReady() {
        debug('tracker: %s is running', this.trackerId)
    }

    sendPeers(peer) {
        debug('sending peers')

        const peers = getPeersTopology(this.peers, getAddress(peer))
        this.connection.send(peer, encoder.peersMessage(peers))
    }

    statusPeer(peer, status) {
        debug('received from %s status %s', getAddress(peer), JSON.stringify(status))
        this.peers.set(getAddress(peer), status)
    }

    findStream(sender, streamId) {
        debug('tracker looking for the stream %s', streamId)

        this.peers.forEach((status, nodeAddress) => {
            if (status.streams.includes(streamId)) {
                this.connection.send(sender, encoder.streamMessage(streamId, nodeAddress))
            }
        })
    }
}
