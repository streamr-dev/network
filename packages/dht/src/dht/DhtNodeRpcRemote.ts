import { RpcCommunicator } from '@streamr/proto-rpc'
import { Logger } from '@streamr/utils'
import { v4 } from 'uuid'
import { NodeID } from '../helpers/nodeId'
import { getNodeIdFromPeerDescriptor } from '../helpers/peerIdFromPeerDescriptor'
import {
    ClosestPeersRequest,
    LeaveNotice,
    PeerDescriptor,
    PingRequest
} from '../proto/packages/dht/protos/DhtRpc'
import { DhtNodeRpcClient } from '../proto/packages/dht/protos/DhtRpc.client'
import { ServiceID } from '../types/ServiceID'
import { RpcRemote } from './contact/RpcRemote'

const logger = new Logger(module)

// Fields required by objects stored in the k-bucket library
export interface KBucketContact {
    id: Uint8Array
    vectorClock: number
}

export class DhtNodeRpcRemote extends RpcRemote<DhtNodeRpcClient> implements KBucketContact {

    private static counter = 0
    public vectorClock: number
    public readonly id: Uint8Array
    private readonly serviceId: ServiceID

    constructor(
        localPeerDescriptor: PeerDescriptor,
        peerDescriptor: PeerDescriptor,
        serviceId: ServiceID,
        rpcCommunicator: RpcCommunicator,
        rpcRequestTimeout?: number
    ) {
        super(localPeerDescriptor, peerDescriptor, rpcCommunicator, DhtNodeRpcClient, rpcRequestTimeout)
        this.id = this.getPeerDescriptor().nodeId
        this.vectorClock = DhtNodeRpcRemote.counter++
        this.serviceId = serviceId
    }

    async getClosestPeers(nodeId: Uint8Array): Promise<PeerDescriptor[]> {
        logger.trace(`Requesting getClosestPeers on ${this.serviceId} from ${getNodeIdFromPeerDescriptor(this.getPeerDescriptor())}`)
        const request: ClosestPeersRequest = {
            nodeId,
            requestId: v4()
        }
        try {
            const peers = await this.getClient().getClosestPeers(request, this.formDhtRpcOptions())
            return peers.peers
        } catch (err) {
            logger.trace(`getClosestPeers error ${this.serviceId}`, { err })
            throw err
        }
    }

    async ping(): Promise<boolean> {
        logger.trace(`Requesting ping on ${this.serviceId} from ${getNodeIdFromPeerDescriptor(this.getPeerDescriptor())}`)
        const request: PingRequest = {
            requestId: v4()
        }
        const options = this.formDhtRpcOptions()
        try {
            const pong = await this.getClient().ping(request, options)
            if (pong.requestId === request.requestId) {
                return true
            }
        } catch (err) {
            logger.trace(`ping failed on ${this.serviceId} to ${getNodeIdFromPeerDescriptor(this.getPeerDescriptor())}: ${err}`)
        }
        return false
    }

    leaveNotice(): void {
        logger.trace(`Sending leaveNotice on ${this.serviceId} from ${getNodeIdFromPeerDescriptor(this.getPeerDescriptor())}`)
        const request: LeaveNotice = {
            serviceId: this.serviceId
        }
        const options = this.formDhtRpcOptions({
            notification: true
        })
        this.getClient().leaveNotice(request, options).catch((e) => {
            logger.trace('Failed to send leaveNotice' + e)
        })
    }

    getNodeId(): NodeID {
        return getNodeIdFromPeerDescriptor(this.getPeerDescriptor())
    }
}
