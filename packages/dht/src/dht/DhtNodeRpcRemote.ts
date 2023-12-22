import { RpcCommunicator } from '@streamr/proto-rpc'
import { Logger } from '@streamr/utils'
import { v4 } from 'uuid'
import { NodeID } from '../helpers/nodeId'
import { getNodeIdFromPeerDescriptor } from '../helpers/peerIdFromPeerDescriptor'
import {
    ClosestPeersRequest,
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

    constructor(
        localPeerDescriptor: PeerDescriptor,
        peerDescriptor: PeerDescriptor,
        serviceId: ServiceID,
        rpcCommunicator: RpcCommunicator,
        rpcRequestTimeout?: number
    ) {
        super(localPeerDescriptor, peerDescriptor, serviceId, rpcCommunicator, DhtNodeRpcClient, rpcRequestTimeout)
        this.id = this.getPeerDescriptor().nodeId
        this.vectorClock = DhtNodeRpcRemote.counter++
    }

    async getClosestPeers(nodeId: Uint8Array): Promise<PeerDescriptor[]> {
        logger.trace(`Requesting getClosestPeers on ${this.getServiceId()} from ${getNodeIdFromPeerDescriptor(this.getPeerDescriptor())}`)
        const request: ClosestPeersRequest = {
            nodeId,
            requestId: v4()
        }
        try {
            const peers = await this.getClient().getClosestPeers(request, this.formDhtRpcOptions())
            return peers.peers
        } catch (err) {
            logger.trace(`getClosestPeers error ${this.getServiceId()}`, { err })
            throw err
        }
    }

    async ping(): Promise<boolean> {
        logger.trace(`Requesting ping on ${this.getServiceId()} from ${getNodeIdFromPeerDescriptor(this.getPeerDescriptor())}`)
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
            logger.trace(`ping failed on ${this.getServiceId()} to ${getNodeIdFromPeerDescriptor(this.getPeerDescriptor())}: ${err}`)
        }
        return false
    }

    leaveNotice(): void {
        logger.trace(`Sending leaveNotice on ${this.getServiceId()} from ${getNodeIdFromPeerDescriptor(this.getPeerDescriptor())}`)
        const options = this.formDhtRpcOptions({
            notification: true
        })
        this.getClient().leaveNotice({}, options).catch((e) => {
            logger.trace('Failed to send leaveNotice' + e)
        })
    }

    getNodeId(): NodeID {
        return getNodeIdFromPeerDescriptor(this.getPeerDescriptor())
    }
}
