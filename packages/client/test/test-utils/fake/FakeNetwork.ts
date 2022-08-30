import { EthereumAddress, StreamMessage } from 'streamr-client-protocol'
import { NodeID } from '../../../src/NetworkNodeFacade'
import { FakeNetworkNode } from './FakeNetworkNode'

export class FakeNetwork {

    private readonly nodes: Map<NodeID, FakeNetworkNode> = new Map()
    private sentMessages: StreamMessage[] = []

    addNode(node: FakeNetworkNode): void {
        if (!this.nodes.has(node.id)) {
            this.nodes.set(node.id, node)
        } else {
            throw new Error(`Duplicate node: ${node.id}`)
        }
    }

    removeNode(address: EthereumAddress): void {
        this.nodes.delete(address)
    }

    getNode(address: EthereumAddress): FakeNetworkNode | undefined {
        return this.nodes.get(address)
    }

    getNodes(): FakeNetworkNode[] {
        return Array.from(this.nodes.values())
    }

    sendMessage(msg: StreamMessage, sender: NodeID | undefined, isRecipient: (networkNode: FakeNetworkNode) => boolean): void {
        /*
        * This serialization+serialization is needed in test/integration/Encryption.ts
        * as it expects that the EncryptedGroupKey format changes in the process.
        * TODO: should we change the serialization or the test? Or keep this hack?
        */
        const serialized = msg.serialize()
        this.getNodes().forEach(async (networkNode) => {
            if (isRecipient(networkNode)) {
                networkNode.messageListeners.forEach((listener) => {
                    // return a clone as client mutates message when it decrypts messages
                    const deserialized = StreamMessage.deserialize(serialized)
                    listener(deserialized, sender)
                })
            }
        })
        this.sentMessages.push(msg)
    }

    getSentMessages(): StreamMessage[] {
        return this.sentMessages
    }
}
