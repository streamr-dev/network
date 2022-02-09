import debug from 'debug'
import { pull } from 'lodash'
import { EthereumAddress, StreamMessage, StreamPartID } from 'streamr-client-protocol'
import { MetricsContext } from 'streamr-network'
import BrubeckNode, { NetworkNodeStub } from '../../../src/BrubeckNode'
import { DestroySignal } from '../../../src/DestroySignal'
import { ActiveNodes } from './ActiveNodes'

type MessageListener = (msg: StreamMessage) => void

class FakeNetworkNodeStub implements NetworkNodeStub {

    node: FakeBrubeckNode
    subsciptions: Set<StreamPartID> = new Set()
    messageListeners: MessageListener[] = []

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
    
    subscribe(streamPartId: StreamPartID) {
        this.subsciptions.add(streamPartId)
    }
    
    unsubscribe(streamPartId: StreamPartID) {
        this.subsciptions.delete(streamPartId)
    }
    
    getStreamParts(): Iterable<StreamPartID>{
        throw new Error('not implemented')
    }

    getNeighbors(): ReadonlyArray<string> {
        throw new Error('not implemented')
    }

    getNeighborsForStreamPart(_streamPartId: StreamPartID): ReadonlyArray<string> {
        throw new Error('not implemented')
    }

    getRtt(nodeId: string): number | undefined {
        throw new Error('not implemented')
    }

    setExtraMetadata(_metadata: Record<string, unknown>) {
        throw new Error('not implemented')
    }

    getMetricsContext(): MetricsContext {
        throw new Error('not implemented')
    }
}

export class FakeBrubeckNode implements Omit<BrubeckNode, 'startNodeCalled' | 'startNodeComplete'> {

    readonly id: EthereumAddress
    readonly debug
    private activeNodes: ActiveNodes
    private networkNodeStub: FakeNetworkNodeStub

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

    // eslint-disable-next-line class-methods-use-this
    publishToNode(msg: StreamMessage): void {
        /*
            * This serialization+serialization is needed in test/integration/Encryption.ts
            * as it expects that the EncryptedGroupKey format changes in the process.
            * TODO: should we change the serialization or the test? Or keep this hack?
            */
        const serialized = msg.serialize()
        this.activeNodes.getNodes()
            .forEach(async (n) => {
                const networkNode = await n.getNode()
                if (networkNode.subsciptions.has(msg.getStreamPartID())) {
                    const deserialized = StreamMessage.deserialize(serialized)
                    networkNode.messageListeners.forEach((listener) => listener(deserialized))
                }
            })
    }

    async getNode(): Promise<FakeNetworkNodeStub> {
        return this.networkNodeStub
    }

    // eslint-disable-next-line class-methods-use-this
    async startNode(): Promise<unknown> {
        // no-op
        return
    }

    // eslint-disable-next-line class-methods-use-this
    async openPublishProxyConnectionOnStreamPart(_streamPartId: StreamPartID, _nodeId: string): Promise<void> {
        throw new Error('not implemented')
    }

    // eslint-disable-next-line class-methods-use-this
    async closePublishProxyConnectionOnStreamPart(_streamPartId: StreamPartID, _nodeId: string): Promise<void> {
        throw new Error('not implemented')
    }
}
