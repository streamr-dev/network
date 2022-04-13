import EventEmitter = require('events')
import { ClosestPeersRequest, ClosestPeersResponse, Neighbor } from '../../proto/ClosestPeers'
import { AbstractTransport } from '../../transport/AbstractTransport'
import { PeerID } from '../../types'

export enum Event {
    REQUEST_RECEIVED = 'streamr:dht:getClosestPeers:request'
}

export interface ClosestPeersServer {
    on(event: Event.REQUEST_RECEIVED, listener: (peerId: PeerID) => void): this
}

export class ClosestPeersServer extends EventEmitter {
    private readonly transport: AbstractTransport
    constructor(transport: AbstractTransport) {
        super()
        this.transport = transport
    }

    getClosestPeers(request: Uint8Array): void {
        console.info('ClosestPeersServer: getClosestPeers')
        const { peerId, nonce } = ClosestPeersRequest.fromBinary(request)
        const neighbors = this.findClosestPeers(peerId)
        this.emit(Event.REQUEST_RECEIVED, peerId)
        this.sendClosestPeersResponse(peerId, neighbors, nonce)
    }

    // Find closest peers to id from kademlia
    findClosestPeers(_peerId: PeerID): Neighbor[] {
        return []
    }

    sendClosestPeersResponse(peerId: PeerID, neighbors: Neighbor[], nonce: string): void {
        console.info('ClosestPeersServer: sendResponse')
        const response: ClosestPeersResponse = {
            neighbors,
            nonce
        }
        const bytes = ClosestPeersResponse.toBinary(response)
        this.transport.send(peerId, bytes)
    }
}
