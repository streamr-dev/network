module.exports = class PeerBook {
    constructor() {
        this.idToAddress = {}
        this.idToType = {}
        this.addressToId = {}
    }

    add(peerAddress, metadata) {
        const peerId = metadata['streamr-peer-id']
        const peerType = metadata['streamr-peer-type']

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
            throw new Error(`Id ${peerId} not found in peer book`)
        }
        return this.idToAddress[peerId]
    }

    getPeerId(address) {
        if (!this.addressToId[address]) {
            throw new Error(`Address ${address} not found in peer book`)
        }
        return this.addressToId[address]
    }

    hasPeerId(address) {
        return this.idToAddress[address] != null
    }

    isTracker(peerId) {
        if (!this.idToType[peerId]) {
            throw new Error(`Id ${peerId} not found in peer book`)
        }
        return this.idToType[peerId] === 'tracker'
    }

    isNode(peerId) {
        if (!this.idToType[peerId]) {
            throw new Error(`Id ${peerId} not found in peer book`)
        }
        return this.idToType[peerId] === 'node'
    }

    isClient(peerId) {
        if (!this.idToType[peerId]) {
            throw new Error(`Id ${peerId} not found in peer book`)
        }
        return this.idToType[peerId] === 'client'
    }
}
