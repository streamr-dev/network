import { StreamMessage, StreamPartID } from '@streamr/protocol'
import { DhtAddress, PeerDescriptor } from '@streamr/dht'
import { StreamMessageTranslator } from './logic/protocol-integration/stream-message/StreamMessageTranslator'
import { NetworkOptions, NetworkStack, NodeInfo } from './NetworkStack'
import { EthereumAddress, Logger, MetricsContext } from '@streamr/utils'
import { ProxyDirection } from './proto/packages/trackerless-network/protos/NetworkRpc'
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
        this.stack.getContentDeliveryManager().on('newMessage', (msg) => {
            if (this.messageListeners.length > 0) {
                try {
                    const translated = StreamMessageTranslator.toClientProtocol(msg)
                    for (const listener of this.messageListeners) {
                        listener(translated)
                    }
                } catch (err) {
                    logger.trace(`Could not translate message`, { err })
                }
            }
        })
    }

    async start(doJoin?: boolean): Promise<void> {
        await this.stack.start(doJoin)
    }

    async inspect(node: PeerDescriptor, streamPartId: StreamPartID): Promise<boolean> {
        return this.stack.getContentDeliveryManager().inspect(node, streamPartId)
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
        await this.stack.getContentDeliveryManager().setProxies(streamPartId, nodes, direction, userId, connectionCount)
    }

    isProxiedStreamPart(streamPartId: StreamPartID): boolean {
        return this.stack.getContentDeliveryManager().isProxiedStreamPart(streamPartId)
    }

    addMessageListener(cb: (msg: StreamMessage) => void): void {
        this.messageListeners.push(cb)
    }

    setStreamPartEntryPoints(streamPartId: StreamPartID, contactPeerDescriptors: PeerDescriptor[]): void {
        this.stack.getContentDeliveryManager().setStreamPartEntryPoints(streamPartId, contactPeerDescriptors)
    }

    removeMessageListener(cb: (msg: StreamMessage) => void): void {
        pull(this.messageListeners, cb)
    }

    async leave(streamPartId: StreamPartID): Promise<void> {
        if (this.stopped) {
            return
        }
        await this.stack.getContentDeliveryManager().leaveStreamPart(streamPartId)
    }

    getNeighbors(streamPartId: StreamPartID): ReadonlyArray<DhtAddress> {
        return this.stack.getContentDeliveryManager().getNeighbors(streamPartId)
    }

    hasStreamPart(streamPartId: StreamPartID): boolean {
        return this.stack.getContentDeliveryManager().hasStreamPart(streamPartId)
    }

    async stop(): Promise<void> {
        this.stopped = true
        await this.stack.stop()
    }

    getPeerDescriptor(): PeerDescriptor {
        return this.stack.getLayer0Node().getLocalPeerDescriptor()
    }

    getMetricsContext(): MetricsContext {
        return this.stack.getMetricsContext()
    }

    getNodeId(): DhtAddress {
        return this.stack.getContentDeliveryManager().getNodeId()
    }

    getOptions(): NetworkOptions {
        return this.stack.getOptions()
    }

    getStreamParts(): StreamPartID[] {
        return this.stack.getContentDeliveryManager().getStreamParts()
    }

    async fetchNodeInfo(node: PeerDescriptor): Promise<NodeInfo> {
        return this.stack.fetchNodeInfo(node)
    }

    // eslint-disable-next-line class-methods-use-this
    getDiagnosticInfo(): Record<string, unknown> {
        return {}
    }
}
