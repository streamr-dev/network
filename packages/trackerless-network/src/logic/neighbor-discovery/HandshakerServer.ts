import { Empty } from "../../proto/google/protobuf/empty"
import { InterleaveNotice, StreamHandshakeRequest, StreamHandshakeResponse } from "../../proto/packages/trackerless-network/protos/NetworkRpc"
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { PeerList } from "../PeerList"
import { ConnectionLocker, PeerDescriptor } from "@streamr/dht"
import { IHandshakeRpc } from "../../proto/packages/trackerless-network/protos/NetworkRpc.server"

interface HandshakerServerConfig {
    randomGraphId: string
    targetNeighbors: PeerList
    connectionLocker: ConnectionLocker
    handleRequest: (request: StreamHandshakeRequest) => StreamHandshakeResponse
    interleaveHandshake: (target: PeerDescriptor, senderId: string) => Promise<boolean>
}

export class HandshakerServer implements IHandshakeRpc {

    private readonly config: HandshakerServerConfig

    constructor(config: HandshakerServerConfig) {
        this.config = config
    }

    async handshake(request: StreamHandshakeRequest, _context: ServerCallContext): Promise<StreamHandshakeResponse> {
        return this.config.handleRequest(request)
    }

    async interleaveNotice(message: InterleaveNotice, _context: ServerCallContext): Promise<Empty> {
        if (message.randomGraphId === this.config.randomGraphId) {
            if (this.config.targetNeighbors.hasPeerWithStringId(message.senderId)) {
                const senderDescriptor = this.config.targetNeighbors.getNeighborWithId(message.senderId)!.getPeerDescriptor()
                this.config.connectionLocker.unlockConnection(senderDescriptor, this.config.randomGraphId)
                this.config.targetNeighbors.remove(senderDescriptor)
            }
            console.log(this.config)
            this.config.interleaveHandshake(message.interleaveTarget!, message.senderId).catch((_e) => {})
        }
        return Empty
    }
}