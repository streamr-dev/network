import debug from 'debug'
import { pull } from 'lodash'
import { EthereumAddress, StreamMessage, StreamPartID } from 'streamr-client-protocol'
import { DestroySignal } from '../../../src/DestroySignal'
import { FakeBrubeckNodeRegistry } from './FakeBrubeckNodeRegistry'

const log = debug('Streamr:FakeBrubeckNode')

export class FakeBrubeckNode {

    private address: EthereumAddress
    public subsribedStreamParts: Set<StreamPartID> = new Set()
    public messageListeners: ((msg: StreamMessage) => void)[] = []
    private fakeBrubeckNodeRegistry: FakeBrubeckNodeRegistry

    constructor(
        address: EthereumAddress,
        fakeBrubeckNodeRegistry: FakeBrubeckNodeRegistry,
        destroySignal: DestroySignal | undefined,
        name?: string
    ) {
        this.address = address.toLowerCase()
        this.fakeBrubeckNodeRegistry = fakeBrubeckNodeRegistry
        if (destroySignal !== undefined) {
            destroySignal.onDestroy(() => this.destroy())
        }
        log(`Created${name ? ' ' + name : ''}: ${address}`)
    }

    getAddress() {
        return this.address
    }

    // eslint-disable-next-line class-methods-use-this
    startNode() {
    }

    // the instance of FakeBrubeckNode is both BrubeckNode and NetworkNode
    async getNode() {
        return this
    }

    addMessageListener(listener: (msg: StreamMessage) => void) {
        this.messageListeners.push(listener)
    }

    removeMessageListener(listener: (msg: StreamMessage) => void) {
        pull(this.messageListeners, listener)
    }

    subscribe(streamPartId: StreamPartID) {
        this.subsribedStreamParts.add(streamPartId)
    }

    unsubscribe(streamPartId: StreamPartID) {
        this.subsribedStreamParts.delete(streamPartId)
    }

    // eslint-disable-next-line class-methods-use-this
    publishToNode(msg: StreamMessage) {
        this.fakeBrubeckNodeRegistry.getNodes()
            .filter((n) => n.subsribedStreamParts.has(msg.getStreamPartID()))
            .forEach((n) => {
                /*
                 * This serialization+serialization is needed in test/integration/Encryption.ts
                 * as it expects that the EncryptedGroupKey format changes in the process.
                 * TODO: should we change the serialization or the test? Or keep this hack?
                 */
                const serialized = msg.serialize()
                const deserialized = StreamMessage.deserialize(serialized)
                n.messageListeners.forEach((listener) => listener(deserialized))
            })
    }

    destroy() {
        log(`destroy ${this.address}`)
        this.fakeBrubeckNodeRegistry.removeNode(this.address)
    }

    // TODO implement other public methods of BrubeckNode
}
