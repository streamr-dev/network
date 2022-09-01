import { Lifecycle, scoped } from 'tsyringe'
import { pull } from 'lodash'
import { ProxyDirection, StreamMessage, StreamPartID } from 'streamr-client-protocol'
import { MetricsContext, NodeId } from 'streamr-network'
import { NetworkNodeOptions } from 'streamr-network'
import { NetworkNodeFactory, NetworkNodeStub } from '../../../src/NetworkNodeFacade'
import { FakeNetwork } from './FakeNetwork'

type MessageListener = (msg: StreamMessage) => void

export class FakeNetworkNode implements NetworkNodeStub {

    public readonly id: NodeId
    readonly subscriptions: Set<StreamPartID> = new Set()
    readonly messageListeners: MessageListener[] = []
    private readonly network: FakeNetwork

    constructor(opts: NetworkNodeOptions, network: FakeNetwork) {
        this.id = opts.id!
        this.network = network
    }

    getNodeId(): string {
        return this.id
    }

    addMessageListener(listener: (msg: StreamMessage<unknown>) => void): void {
        this.messageListeners.push(listener)
    }

    removeMessageListener(listener: (msg: StreamMessage<unknown>) => void): void {
        pull(this.messageListeners, listener)
    }

    subscribe(streamPartId: StreamPartID): void {
        this.subscriptions.add(streamPartId)
    }

    unsubscribe(streamPartId: StreamPartID): void {
        this.subscriptions.delete(streamPartId)
    }

    async subscribeAndWaitForJoin(streamPartId: StreamPartID, _timeout?: number): Promise<number> {
        this.subscriptions.add(streamPartId)
        return this.getNeighborsForStreamPart(streamPartId).length
    }

    async waitForJoinAndPublish(msg: StreamMessage, _timeout?: number): Promise<number> {
        const streamPartID = msg.getStreamPartID()
        this.subscriptions.add(streamPartID)
        this.publish(msg)
        return this.getNeighborsForStreamPart(streamPartID).length
    }

    publish(msg: StreamMessage): void {
        this.network.send(msg, this.id, (node: FakeNetworkNode) => node.subscriptions.has(msg.getStreamPartID()))
    }

    // eslint-disable-next-line class-methods-use-this
    getStreamParts(): Iterable<StreamPartID> {
        throw new Error('not implemented')
    }

    // eslint-disable-next-line class-methods-use-this
    getNeighbors(): ReadonlyArray<string> {
        throw new Error('not implemented')
    }

    getNeighborsForStreamPart(streamPartId: StreamPartID): ReadonlyArray<string> {
        const allNodes = this.network.getNodes()
        return allNodes
            .filter((node) => (node.id !== this.id))
            .filter((node) => node.subscriptions.has(streamPartId))
            .map((node) => node.id)
    }

    // eslint-disable-next-line class-methods-use-this
    getRtt(_nodeId: string): number | undefined {
        throw new Error('not implemented')
    }

    // eslint-disable-next-line class-methods-use-this
    setExtraMetadata(_metadata: Record<string, unknown>): void {
        throw new Error('not implemented')
    }

    // eslint-disable-next-line class-methods-use-this
    getMetricsContext(): MetricsContext {
        throw new Error('not implemented')
    }

    hasStreamPart(streamPartId: StreamPartID): boolean {
        return this.subscriptions.has(streamPartId)
    }

    // eslint-disable-next-line class-methods-use-this
    hasProxyConnection(_streamPartId: StreamPartID, _contactNodeId: string, _direction: ProxyDirection): boolean {
        throw new Error('not implemented')
    }

    start(): void {
        this.network.addNode(this)
    }

    async stop(): Promise<void> {
        this.network.removeNode(this.id)
    }

    // eslint-disable-next-line class-methods-use-this
    async openProxyConnection(_streamPartId: StreamPartID, _nodeId: string, _direction: ProxyDirection): Promise<void> {
        throw new Error('not implemented')
    }

    // eslint-disable-next-line class-methods-use-this
    async closeProxyConnection(_streamPartId: StreamPartID, _nodeId: string, _direction: ProxyDirection): Promise<void> {
        throw new Error('not implemented')
    }
}

@scoped(Lifecycle.ContainerScoped)
export class FakeNetworkNodeFactory implements NetworkNodeFactory {

    private network: FakeNetwork

    constructor(network: FakeNetwork) {
        this.network = network
    }

    createNetworkNode(opts: NetworkNodeOptions): FakeNetworkNode {
        return new FakeNetworkNode(opts, this.network)
    }
}
