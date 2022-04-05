import debug from 'debug'
import { pull } from 'lodash'
import { EthereumAddress, ProxyDirection, StreamMessage, StreamPartID } from 'streamr-client-protocol'
import { MetricsContext } from 'streamr-network'
import BrubeckNode, { NetworkNodeStub } from '../../../src/BrubeckNode'
import { DestroySignal } from '../../../src/DestroySignal'
import { ActiveNodes } from './ActiveNodes'

type MessageListener = (msg: StreamMessage) => void

class FakeNetworkNodeStub implements NetworkNodeStub {

    private readonly node: FakeBrubeckNode
    readonly subscriptions: Set<StreamPartID> = new Set()
    private readonly messageListeners: MessageListener[] = []

    constructor(node: FakeBrubeckNode) {
        this.node = node
    }

    getNodeId(): string {
        return this.node.id
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
        /*
         * This serialization+serialization is needed in test/integration/Encryption.ts
         * as it expects that the EncryptedGroupKey format changes in the process.
         * TODO: should we change the serialization or the test? Or keep this hack?
         */
        const serialized = msg.serialize()
        this.node.activeNodes.getNodes()
            .forEach(async (n) => {
                const networkNode = await n.getNode()
                if (networkNode.subscriptions.has(msg.getStreamPartID())) {
                    networkNode.messageListeners.forEach((listener) => {
                        // return a clone as client mutates message when it decrypts messages
                        const deserialized = StreamMessage.deserialize(serialized)
                        listener(deserialized)
                    })
                }
            })
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
        const allNodes = this.node.activeNodes.getNodes()
        return allNodes
            .filter((node) => (node.id !== this.node.id))
            .filter((node) => node.networkNodeStub.subscriptions.has(streamPartId))
            .map((node) => node.id)
    }

    // eslint-disable-next-line class-methods-use-this
    getRtt(_nodeId: string): number | undefined {
        throw new Error('not implemented')
    }

    // eslint-disable-next-line class-methods-use-this
    setExtraMetadata(_metadata: Record<string, unknown>) {
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
}

export class FakeBrubeckNode implements Omit<BrubeckNode, 'startNodeCalled' | 'startNodeComplete'> {

    readonly id: EthereumAddress
    readonly debug
    readonly activeNodes: ActiveNodes
    readonly networkNodeStub: FakeNetworkNodeStub

    constructor(
        id: EthereumAddress,
        activeNodes: ActiveNodes,
        destroySignal: DestroySignal | undefined,
        name?: string
    ) {
        this.id = id.toLowerCase()
        this.debug = debug('Streamr:FakeBrubeckNode')
        this.activeNodes = activeNodes
        this.networkNodeStub = new FakeNetworkNodeStub(this)
        if (destroySignal !== undefined) {
            destroySignal.onDestroy(() => {
                this.debug(`destroy ${this.id}`)
                this.activeNodes.removeNode(this.id)
            })
        }
        this.debug(`Created${name ? ' ' + name : ''}: ${id}`)
    }

    async getNodeId(): Promise<EthereumAddress> {
        return this.id
    }

    publishToNode(msg: StreamMessage): void {
        this.networkNodeStub.publish(msg)
    }

    async getNode(): Promise<FakeNetworkNodeStub> {
        return this.networkNodeStub
    }

    // eslint-disable-next-line class-methods-use-this
    async startNode(): Promise<any> {
        // no-op
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
