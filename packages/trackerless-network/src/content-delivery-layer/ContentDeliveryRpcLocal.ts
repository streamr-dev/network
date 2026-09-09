import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { DhtAddress, DhtCallContext, ListeningRpcCommunicator, PeerDescriptor, toNodeId } from '@streamr/dht'
import { StreamPartID } from '@streamr/utils'
import { Empty } from '../../generated/google/protobuf/empty'
import {
    LeaveStreamPartNotice,
    MessageID,
    MessageRef,
    StreamMessage
} from '../../generated/packages/trackerless-network/protos/NetworkRpc'
import { IContentDeliveryRpc } from '../../generated/packages/trackerless-network/protos/NetworkRpc.server'
import { PlumtreeManager } from './plumtree/PlumtreeManager'
import { logGapDiagnosticEvent, logGapDiagnosticSampled } from '../GapDiagnostics'

export interface ContentDeliveryRpcLocalOptions {
    localPeerDescriptor: PeerDescriptor
    streamPartId: StreamPartID
    markAndCheckDuplicate: (messageId: MessageID, previousMessageRef?: MessageRef) => boolean
    getDuplicateLatest?: (messageId: MessageID) => [number, number] | undefined
    broadcast: (message: StreamMessage, previousNode?: DhtAddress) => void
    onLeaveNotice(remoteNodeId: DhtAddress, isLocalNodeEntryPoint: boolean): void
    markForInspection(remoteNodeId: DhtAddress, messageId: MessageID): void
    rpcCommunicator: ListeningRpcCommunicator
    plumtreeManager?: PlumtreeManager
}

export class ContentDeliveryRpcLocal implements IContentDeliveryRpc {
    
    private readonly options: ContentDeliveryRpcLocalOptions

    constructor(options: ContentDeliveryRpcLocalOptions) {
        this.options = options
    }

    // Diagnostics: ring of recently ACCEPTED (ts,seq) per chain so a rejected
    // message can be classified as a re-send (seen before) vs a reorder (never
    // seen, only older than the detector's bar).
    private readonly acceptedRing = new Map<string, number[]>()
    private static readonly RING = 4000

    private classify(messageId: MessageID, accepted: boolean, previousNodeId: DhtAddress): void {
        const key = `${messageId.messageChainId}`
        const code = Number(messageId.timestamp) * 4096 + messageId.sequenceNumber
        let ring = this.acceptedRing.get(key)
        if (ring === undefined) {
            ring = []
            this.acceptedRing.set(key, ring)
        }
        if (accepted) {
            ring.push(code)
            if (ring.length > ContentDeliveryRpcLocal.RING) {
                ring.splice(0, ring.length - ContentDeliveryRpcLocal.RING)
            }
            return
        }
        const seenBefore = ring.includes(code)
        const bar = this.options.getDuplicateLatest?.(messageId)
        logGapDiagnosticEvent('trackerless.dupReject', {
            part: this.options.streamPartId,
            chain: messageId.messageChainId,
            ts: Number(messageId.timestamp),
            seq: messageId.sequenceNumber,
            barTs: bar?.[0],
            barSeq: bar?.[1],
            behindBarMs: bar ? bar[0] - Number(messageId.timestamp) : undefined,
            seenBefore,
            from: previousNodeId.slice(0, 8)
        })
    }

    async sendStreamMessage(message: StreamMessage, context: ServerCallContext): Promise<Empty> {
        logGapDiagnosticSampled('trackerless.rpcLocal.sendStreamMessage')
        const previousNode = (context as DhtCallContext).incomingSourceDescriptor!
        const previousNodeId = toNodeId(previousNode)
        this.options.markForInspection(previousNodeId, message.messageId!)
        if (this.options.plumtreeManager === undefined) {
            const accepted = this.options.markAndCheckDuplicate(message.messageId!, message.previousMessageRef)
            this.classify(message.messageId!, accepted, previousNodeId)
            if (accepted) {
                this.options.broadcast(message, previousNodeId)
            }
        } else if (this.options.markAndCheckDuplicate(message.messageId!, message.previousMessageRef)) {
            // Message is not a duplicate, so we can broadcast it over the plumtree
            this.options.plumtreeManager.broadcast(message, previousNodeId)
        } else {
            // Message is a duplicate, so we need to pause the neighbor
            await this.options.plumtreeManager.pauseNeighbor(previousNode, message.messageId!.messageChainId)
        }
        return Empty
    }

    async leaveStreamPartNotice(message: LeaveStreamPartNotice, context: ServerCallContext): Promise<Empty> {
        if (message.streamPartId === this.options.streamPartId) {
            const sourcePeerDescriptor = (context as DhtCallContext).incomingSourceDescriptor!
            const remoteNodeId = toNodeId(sourcePeerDescriptor)
            this.options.onLeaveNotice(remoteNodeId, message.isEntryPoint)
        }
        return Empty
    }
}
