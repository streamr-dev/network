const Endpoint = require('./connection/Endpoint')

module.exports = class PeerBook {
    constructor(endpoint) {
        this.addressToId = {}
        this.addressToType = {}
        endpoint.on(Endpoint.events.PEER_CONNECTED, (peer, customHeaders) => {
            this.addressToId[peer] = customHeaders['streamr-peer-id']
            this.addressToType[peer] = customHeaders['streamr-peer-type']
        })
    }

    getShortId(address) {
        return this.addressToId[address]
    }
}
