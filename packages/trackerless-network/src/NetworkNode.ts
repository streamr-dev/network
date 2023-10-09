import { StreamMessage, StreamPartID } from '@streamr/protocol'
import { PeerDescriptor } from '@streamr/dht'
import { StreamMessageTranslator } from './logic/protocol-integration/stream-message/StreamMessageTranslator'
import { NetworkOptions, NetworkStack } from './NetworkStack'
import { EthereumAddress, Logger, MetricsContext } from '@streamr/utils'
import { InfoResponse, ProxyDirection } from './proto/packages/trackerless-network/protos/NetworkRpc'
import { NodeID } from './identifiers'
import { pull } from 'lodash'

export const createNetworkNode = (opts: NetworkOptions): NetworkNode => {
    return new NetworkNode(new NetworkStack(opts))
}

const logger = new Logger(module)
/**
 * Convenience wrapper for building client-facing functionality. Used by client.
 */
export class NetworkNode {

    readonly stack: NetworkStack
    private readonly messageListeners: ((msg: StreamMessage) => void)[] = []
    private stopped = false

    /** @internal */
    constructor(stack: NetworkStack) {
        this.stack = stack
        this.stack.getStreamrNode().on('newMessage', (msg) => {
            if (this.messageListeners.length > 0) {
                try {
                    const translated = StreamMessageTranslator.toClientProtocol(msg)
                    for (const listener of this.messageListeners) {
                        listener(translated)
                    }
                } catch (err) {
                    logger.trace(`Could not translate message: ${err}`)
                }
            }
        })
    }

    async start(doJoin?: boolean): Promise<void> {
        await this.stack.start(doJoin)
    }

    async inspect(node: PeerDescriptor, streamPartId: StreamPartID): Promise<boolean> {
        return this.stack.getStreamrNode().inspect(node, streamPartId)
    }

    async broadcast(streamMessage: StreamMessage): Promise<void> {
        const msg = StreamMessageTranslator.toProtobuf(streamMessage)
        await this.stack.broadcast(msg)
    }

    async join(streamPartId: StreamPartID, neighborRequirement?: { minCount: number, timeout: number }): Promise<void> {
        await this.stack.joinStreamPart(streamPartId, neighborRequirement)
    }

    async setProxies(
        streamPartId: StreamPartID,
        nodes: PeerDescriptor[],
        direction: ProxyDirection,
        userId: EthereumAddress,
        connectionCount?: number
    ): Promise<void> {
        await this.stack.getStreamrNode().setProxies(streamPartId, nodes, direction, userId, connectionCount)
    }

    isProxiedStreamPart(streamPartId: StreamPartID): boolean {
        return this.stack.getStreamrNode().isProxiedStreamPart(streamPartId)
    }

    addMessageListener(cb: (msg: StreamMessage) => void): void {
        this.messageListeners.push(cb)
    }

    setStreamPartEntryPoints(streamPartId: StreamPartID, contactPeerDescriptors: PeerDescriptor[]): void {
        this.stack.getStreamrNode()!.setStreamPartEntryPoints(streamPartId, contactPeerDescriptors)
    }

    removeMessageListener(cb: (msg: StreamMessage) => void): void {
        pull(this.messageListeners, cb)
    }

    leave(streamPartId: StreamPartID): void {
        if (this.stopped) {
            return
        }
        this.stack.getStreamrNode().leaveStream(streamPartId)
    }

    getNeighbors(streamPartId: StreamPartID): ReadonlyArray<NodeID> {
        return this.stack.getStreamrNode().getNeighbors(streamPartId)
    }

    hasStreamPart(streamPartId: StreamPartID): boolean {
        return this.stack.getStreamrNode().hasStream(streamPartId)
    }

    async stop(): Promise<void> {
        this.stopped = true
        await this.stack.stop()
    }

    getPeerDescriptor(): PeerDescriptor {
        return this.stack.getLayer0DhtNode().getPeerDescriptor()
    }

    getMetricsContext(): MetricsContext {
        return this.stack.getMetricsContext()
    }

    getNodeId(): NodeID {
        return this.stack.getStreamrNode().getNodeId()
    }

    getStreamParts(): StreamPartID[] {
        return this.stack.getStreamrNode().getStreamParts()
    }

    async fetchNodeInfo(node: PeerDescriptor, getControlLayerInfo: boolean, getStreamPartitionInfo: StreamPartID[]): Promise<InfoResponse> {
        return this.stack.fetchNodeInfo(node, getControlLayerInfo, getStreamPartitionInfo)
    }

    // eslint-disable-next-line class-methods-use-this
    getDiagnosticInfo(): Record<string, unknown> {
        return {}
    }
}
