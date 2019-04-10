class NotFoundInPeerBookError extends Error {
    constructor(...args) {
        super(...args)
        Error.captureStackTrace(this, NotFoundInPeerBookError)
    }
}

class MetadataNotSetError extends Error {
    constructor(fieldName) {
        super(`metadata ${fieldName} not set`)
    }
}

const peerTypes = Object.freeze({
    TRACKER: 'tracker',
    NODE: 'node',
    STORAGE: 'storage'
})

class PeerBook {
    constructor() {
        this.idToAddress = {}
        this.idToType = {}
        this.addressToId = {}
    }

    add(peerAddress, metadata) {
        const peerId = metadata['streamr-peer-id']
        const peerType = metadata['streamr-peer-type']

        if (peerId == null) {
            throw new MetadataNotSetError('streamr-peer-id')
        }
        if (peerType == null) {
            throw new MetadataNotSetError('streamr-peer-type')
        }

        this.idToAddress[peerId] = peerAddress
        this.idToType[peerId] = peerType
        this.addressToId[peerAddress] = peerId
    }

    remove(peerAddress) {
        const peerId = this.addressToId[peerAddress]
        delete this.idToAddress[peerId]
        delete this.idToType[peerId]
        delete this.addressToId[peerAddress]
    }

    getAddress(peerId) {
        if (!this.hasPeerId(peerId)) {
            throw new NotFoundInPeerBookError(`Id ${peerId} not found in peer book`)
        }
        return this.idToAddress[peerId]
    }

    getPeerId(address) {
        if (!this.addressToId[address]) {
            throw new NotFoundInPeerBookError(`Address ${address} not found in peer book`)
        }
        return this.addressToId[address]
    }

    hasPeerId(address) {
        return this.idToAddress[address] != null
    }

    isTracker(peerId) {
        return this.getTypeById(peerId) === peerTypes.TRACKER
    }

    isNode(peerId) {
        return this.getTypeById(peerId) === peerTypes.NODE || this.isStorage(peerId)
    }

    isStorage(peerId) {
        return this.getTypeById(peerId) === peerTypes.STORAGE
    }

    getTypeById(peerId) {
        if (!this.idToType[peerId]) {
            throw new NotFoundInPeerBookError(`Id ${peerId} not found in peer book`)
        }

        return this.idToType[peerId]
    }
}

module.exports = {
    PeerBook,
    peerTypes,
    NotFoundInPeerBookError
}
