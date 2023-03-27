import { Empty } from "../../proto/google/protobuf/empty"
import { InterleaveNotice, StreamHandshakeRequest, StreamHandshakeResponse } from "../../proto/packages/trackerless-network/protos/NetworkRpc"
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { PeerList } from "../PeerList"
import { ConnectionLocker, keyFromPeerDescriptor, PeerDescriptor } from "@streamr/dht"
import { IHandshakeRpc } from "../../proto/packages/trackerless-network/protos/NetworkRpc.server"

interface HandshakerServerConfig {
    randomGraphId: string
    targetNeighbors: PeerList
    connectionLocker: ConnectionLocker
    ongoingHandshakes: Set<string>
    N: number
    respondWithAccepted: (request: StreamHandshakeRequest, requester: PeerDescriptor) => StreamHandshakeResponse
    respondWithUnaccepted: (request: StreamHandshakeRequest) => StreamHandshakeResponse
    respondWithInterleaveRequest: (request: StreamHandshakeRequest, requester: PeerDescriptor) => StreamHandshakeResponse
    interleaveHandshake: (target: PeerDescriptor, senderId: string) => Promise<boolean>
}

export class HandshakerServer implements IHandshakeRpc {

    private readonly config: HandshakerServerConfig

    constructor(config: HandshakerServerConfig) {
        this.config = config
    }

    async handshake(request: StreamHandshakeRequest, _context: ServerCallContext): Promise<StreamHandshakeResponse> {
        return this.handleRequest(request)
    }

    private handleRequest(request: StreamHandshakeRequest): StreamHandshakeResponse {
        if (this.config.targetNeighbors!.hasPeer(request.senderDescriptor!)
            || this.config.ongoingHandshakes.has(keyFromPeerDescriptor(request.senderDescriptor!))
        ) {
            return this.config.respondWithAccepted(request, request.senderDescriptor!)
        } else if (this.config.targetNeighbors!.size() + this.config.ongoingHandshakes.size < this.config.N) {
            return this.config.respondWithAccepted(request, request.senderDescriptor!)
        } else if (this.config.targetNeighbors!.size([request.interleavingFrom!]) >= 2) {
            return this.config.respondWithInterleaveRequest(request, request.senderDescriptor!)
        } else {
            return this.config.respondWithUnaccepted(request)
        }
    }

    async interleaveNotice(message: InterleaveNotice, _context: ServerCallContext): Promise<Empty> {
        if (message.randomGraphId === this.config.randomGraphId) {
            if (this.config.targetNeighbors.hasPeerWithStringId(message.senderId)) {
                const senderDescriptor = this.config.targetNeighbors.getNeighborWithId(message.senderId)!.getPeerDescriptor()
                this.config.connectionLocker.unlockConnection(senderDescriptor, this.config.randomGraphId)
                this.config.targetNeighbors.remove(senderDescriptor)
            }
            this.config.interleaveHandshake(message.interleaveTarget!, message.senderId).catch((_e) => {})
        }
        return Empty
    }
}
