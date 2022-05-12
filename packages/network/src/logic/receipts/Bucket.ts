import { StreamMessage, StreamPartID } from 'streamr-client-protocol'
import { NodeId } from '../../identifiers'

export const WINDOW_LENGTH = 60 * 1000

export function getWindowNumber(timestamp: number): number {
    return Math.floor(timestamp / WINDOW_LENGTH)
}

export function getWindowStartTime(windowNumber: number): number {
    return windowNumber * WINDOW_LENGTH
}

export type BucketID = string & { readonly __brand: 'BucketID' }

export class Bucket {
    private readonly nodeId: NodeId
    private readonly streamPartId: StreamPartID
    private readonly publisherId: string
    private readonly msgChainId: string
    private readonly windowNumber: number
    private messageCount = 0
    private totalPayloadSize = 0
    private lastUpdate = Date.now()

    constructor(includedMessage: StreamMessage, nodeId: NodeId) {
        this.streamPartId = includedMessage.getStreamPartID()
        this.publisherId = includedMessage.getPublisherId()
        this.msgChainId = includedMessage.getMsgChainId()
        this.windowNumber = getWindowNumber(includedMessage.getTimestamp())
        this.nodeId = nodeId
    }

    includes(message: StreamMessage): boolean {
        return this.streamPartId === message.getStreamPartID()
            && this.publisherId.toLowerCase() === message.getPublisherId().toLowerCase()
            && this.msgChainId === message.getMsgChainId()
            && this.windowNumber === getWindowNumber(message.getTimestamp())
    }

    record(payloadSize: number): void {
        this.messageCount += 1
        this.totalPayloadSize += payloadSize
        this.lastUpdate = Date.now()
    }

    getId(): BucketID {
        return (
            this.nodeId
            + ';' + this.streamPartId
            + ';' + this.publisherId
            + ';' + this.msgChainId
            + ';' + this.windowNumber
        ) as BucketID
    }

    getNodeId(): NodeId {
        return this.nodeId
    }

    getStreamPartId(): StreamPartID {
        return this.streamPartId
    }

    getPublisherId(): string {
        return this.publisherId
    }

    getMsgChainId(): string {
        return this.msgChainId
    }

    getWindowNumber(): number {
        return this.windowNumber
    }

    getMessageCount(): number {
        return this.messageCount
    }

    getTotalPayloadSize(): number {
        return this.totalPayloadSize
    }

    getLastUpdate(): number {
        return this.lastUpdate
    }
}
