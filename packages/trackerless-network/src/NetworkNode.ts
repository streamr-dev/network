import { IMessageType } from '@protobuf-ts/runtime'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { DhtAddress, PeerDescriptor } from '@streamr/dht'
import { ProtoRpcClient } from '@streamr/proto-rpc'
import { MetricsContext, StreamPartID, UserID } from '@streamr/utils'
import { ExternalNetworkRpc, ExternalRpcClient, ExternalRpcClientClass } from './logic/ExternalNetworkRpc'
import { NetworkOptions, NetworkStack } from './NetworkStack'
import { ProxyDirection, StreamMessage } from '../generated/packages/trackerless-network/protos/NetworkRpc'
import { NodeInfo } from './types'

export const createNetworkNode = (opts: NetworkOptions): NetworkNode => {
    return new NetworkNode(new NetworkStack(opts))
}

/**
 * Convenience wrapper for building client-facing functionality. Used by client.
 */
export class NetworkNode {
    readonly stack: NetworkStack
    private stopped = false
    private externalNetworkRpc?: ExternalNetworkRpc

    /** @internal */
    constructor(stack: NetworkStack) {
        this.stack = stack
    }

    async start(doJoin?: boolean): Promise<void> {
        await this.stack.start(doJoin)
        this.externalNetworkRpc = new ExternalNetworkRpc(this.stack.getControlLayerNode().getTransport())
    }

    async inspect(node: PeerDescriptor, streamPartId: StreamPartID): Promise<boolean> {
        return this.stack.getContentDeliveryManager().inspect(node, streamPartId)
    }

    async broadcast(msg: StreamMessage): Promise<void> {
        await this.stack.broadcast(msg)
    }

    async join(streamPartId: StreamPartID, neighborRequirement?: { minCount: number; timeout: number }): Promise<void> {
        await this.stack.joinStreamPart(streamPartId, neighborRequirement)
    }

    async setProxies(
        streamPartId: StreamPartID,
        nodes: PeerDescriptor[],
        direction: ProxyDirection,
        userId: UserID,
        connectionCount?: number
    ): Promise<void> {
        await this.stack.getContentDeliveryManager().setProxies(streamPartId, nodes, direction, userId, connectionCount)
    }

    isProxiedStreamPart(streamPartId: StreamPartID): boolean {
        return this.stack.getContentDeliveryManager().isProxiedStreamPart(streamPartId)
    }

    addMessageListener(listener: (msg: StreamMessage) => void): void {
        this.stack.getContentDeliveryManager().on('newMessage', listener)
    }

    setStreamPartEntryPoints(streamPartId: StreamPartID, contactPeerDescriptors: PeerDescriptor[]): void {
        this.stack.getContentDeliveryManager().setStreamPartEntryPoints(streamPartId, contactPeerDescriptors)
    }

    removeMessageListener(listener: (msg: StreamMessage) => void): void {
        this.stack.getContentDeliveryManager().off('newMessage', listener)
    }

    async leave(streamPartId: StreamPartID): Promise<void> {
        if (this.stopped) {
            return
        }
        await this.stack.getContentDeliveryManager().leaveStreamPart(streamPartId)
    }

    getNeighbors(streamPartId: StreamPartID): readonly DhtAddress[] {
        return this.stack.getContentDeliveryManager().getNeighbors(streamPartId)
    }

    hasStreamPart(streamPartId: StreamPartID): boolean {
        return this.stack.getContentDeliveryManager().hasStreamPart(streamPartId)
    }

    async stop(): Promise<void> {
        this.stopped = true
        this.externalNetworkRpc!.destroy()
        await this.stack.stop()
    }

    getPeerDescriptor(): PeerDescriptor {
        return this.stack.getControlLayerNode().getLocalPeerDescriptor()
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

    getDiagnosticInfo(): Record<string, unknown> {
        return {
            controlLayer: this.stack.getControlLayerNode().getDiagnosticInfo(),
            contentLayer: this.stack.getContentDeliveryManager().getDiagnosticInfo()
        }
    }

    registerExternalNetworkRpcMethod<
        RequestClass extends IMessageType<RequestType>,
        ResponseClass extends IMessageType<ResponseType>,
        RequestType extends object,
        ResponseType extends object
    >(
        request: RequestClass,
        response: ResponseClass,
        name: string,
        fn: (req: RequestType, context: ServerCallContext) => Promise<ResponseType>
    ): void {
        this.externalNetworkRpc!.registerRpcMethod(request, response, name, fn)
    }

    createExternalRpcClient<T extends ExternalRpcClient>(clientClass: ExternalRpcClientClass<T>): ProtoRpcClient<T> {
        return this.externalNetworkRpc!.createRpcClient(clientClass)
    }
}
