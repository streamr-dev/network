const { msgTypes, CURRENT_VERSION } = require('./messageTypes')

module.exports = class PeersMessage {
    constructor(peers, source = null) {
        if (typeof peers === 'undefined') {
            throw new Error('peers cant be undefined')
        }
        this.version = CURRENT_VERSION
        this.code = msgTypes.PEERS
        this.source = source
        this.peers = peers
    }

    getVersion() {
        return this.version
    }

    getCode() {
        return this.code
    }

    getPeers() {
        return this.peers
    }

    setPeers(peers) {
        this.peers = peers
        return this
    }

    getSource() {
        return this.source
    }

    setSource(source) {
        this.source = source
        return this
    }

    toJSON() {
        return {
            version: this.getVersion(),
            code: this.getCode(),
            source: this.getSource(),
            peers: this.getPeers()
        }
    }
}
