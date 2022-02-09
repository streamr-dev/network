import debug from 'debug'
import { EthereumAddress, StreamMessage, StreamPartID } from 'streamr-client-protocol'
import { NetworkNode } from 'streamr-network'
import BrubeckNode from '../../../src/BrubeckNode'
import { DestroySignal } from '../../../src/DestroySignal'
import { Multimap } from '../utils'
import { ActiveNodes } from './ActiveNodes'

type MessageListener = (msg: StreamMessage) => void

export class FakeBrubeckNode implements Omit<BrubeckNode, 'startNodeCalled' | 'startNodeComplete'> {

    readonly id: EthereumAddress
    readonly debug
    public messageListeners: Multimap<StreamPartID, MessageListener> = new Multimap()
    private activeNodes: ActiveNodes

    constructor(
        id: EthereumAddress,
        activeNodes: ActiveNodes,
        destroySignal: DestroySignal | undefined,
        name?: string
    ) {
        this.id = id.toLowerCase()
        this.debug = debug('Streamr:FakeBrubeckNode')
        this.activeNodes = activeNodes
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

    async subscribe(streamPartId: StreamPartID, listener: MessageListener): Promise<void> {
        this.messageListeners.add(streamPartId, listener)
    }

    async unsubscribe(streamPartId: StreamPartID, listener: MessageListener): Promise<void> {
        this.messageListeners.remove(streamPartId, listener)
    }

    // eslint-disable-next-line class-methods-use-this
    publishToNode(msg: StreamMessage): void {
        this.activeNodes.getNodes()
            .forEach((n) => {
                /*
                 * This serialization+serialization is needed in test/integration/Encryption.ts
                 * as it expects that the EncryptedGroupKey format changes in the process.
                 * TODO: should we change the serialization or the test? Or keep this hack?
                 */
                const serialized = msg.serialize()
                const deserialized = StreamMessage.deserialize(serialized)
                const listeners = n.messageListeners.get(msg.getStreamPartID())
                listeners.forEach((listener) => listener(deserialized))
            })
    }

    // eslint-disable-next-line class-methods-use-this
    async startNode(): Promise<void> {
        // no-op, no need to explictly start FakeBrubeckNode
    }

    // eslint-disable-next-line class-methods-use-this
    async getNode(): Promise<NetworkNode> {
        throw new Error('not implemented')
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
