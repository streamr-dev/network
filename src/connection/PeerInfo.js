const peerTypes = Object.freeze({
    TRACKER: 'tracker',
    NODE: 'node',
    STORAGE: 'storage'
})

class PeerInfo {
    static newTracker(peerId, peerName, location) {
        return new PeerInfo(peerId, peerTypes.TRACKER, peerName, location)
    }

    static newNode(peerId, peerName, location) {
        return new PeerInfo(peerId, peerTypes.NODE, peerName, location)
    }

    static newStorage(peerId, peerName, location) {
        return new PeerInfo(peerId, peerTypes.STORAGE, peerName, location)
    }

    constructor(peerId, peerType, peerName, location) {
        if (!peerId) {
            throw new Error('peerId not given')
        }
        if (!peerType) {
            throw new Error('peerType not given')
        }
        if (!peerName) {
            // eslint-disable-next-line no-param-reassign
            peerName = peerId
        }
        if (!location) {
            // eslint-disable-next-line no-param-reassign
            location = {
                latitude: null,
                longitude: null,
                country: null,
                city: null
            }
        }
        if (!Object.values(peerTypes).includes(peerType)) {
            throw new Error(`peerType ${peerType} not in peerTypes list`)
        }

        this.peerId = peerId
        this.peerType = peerType
        this.peerName = peerName
        this.location = location
    }

    isTracker() {
        return this.peerType === peerTypes.TRACKER
    }

    isNode() {
        return this.peerType === peerTypes.NODE || this.isStorage()
    }

    isStorage() {
        return this.peerType === peerTypes.STORAGE
    }

    toString() {
        return `${this.peerName} ${this.peerId} (${this.peerType})`
    }
}

module.exports = {
    PeerInfo
}
