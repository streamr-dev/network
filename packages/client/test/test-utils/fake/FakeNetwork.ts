import { StreamMessage, StreamMessageType } from '@streamr/protocol'
import { NodeId } from '@streamr/trackerless-network'
import { FakeNetworkNode } from './FakeNetworkNode'
import { waitForCondition } from '@streamr/utils'

interface Send {
    message: StreamMessage
    sender: NodeId
    recipients: NodeId[]
}

interface SentMessagesFilter {
    messageType?: StreamMessageType
    count?: number
}

export class FakeNetwork {

    private readonly nodes: Map<NodeId, FakeNetworkNode> = new Map()
    private sends: Send[] = []

    addNode(node: FakeNetworkNode): void {
        if (!this.nodes.has(node.id)) {
            this.nodes.set(node.id, node)
        } else {
            throw new Error(`Duplicate node: ${node.id}`)
        }
    }

    removeNode(id: NodeId): void {
        this.nodes.delete(id)
    }

    getNode(id: NodeId): FakeNetworkNode | undefined {
        return this.nodes.get(id)
    }

    getNodes(): FakeNetworkNode[] {
        return Array.from(this.nodes.values())
    }

    send(msg: StreamMessage, sender: NodeId, isRecipient: (networkNode: FakeNetworkNode) => boolean): void {
        const recipients = this.getNodes().filter((n) => isRecipient(n))
        /*
        * This serialization+serialization is needed in test/integration/Encryption.ts
        * as it expects that the EncryptedGroupKey format changes in the process.
        * TODO: should we change the serialization or the test? Or keep this hack?
        */
        recipients.forEach((n) => {
            n.messageListeners.forEach((listener) => listener(msg))
        })
        this.sends.push({
            message: msg,
            sender,
            recipients: recipients.map((n) => n.id)
        })
    }

    getSentMessages(predicate: SentMessagesFilter): StreamMessage[] {
        return this.sends
            .filter((send: Send) => {
                const msg = send.message
                return (predicate.messageType === undefined) || (msg.messageType === predicate.messageType)
            })
            .map((m) => m.message)
    }

    async waitForSentMessages(opts: SentMessagesFilter & { count: number }, timeout = 60 * 1000): Promise<StreamMessage[]> { 
        let found: StreamMessage[] = []
        const count = opts.count
        await waitForCondition(() => {
            found = this.getSentMessages(opts)
            return found.length >= count
        }, timeout, timeout / 100, undefined, () => {
            return `waitForSentMessages timed out: ${JSON.stringify(opts)} matches ${found.length}/${count}`
        })
        return found.slice(0, count)
    }
    
    async waitForSentMessage(opts: SentMessagesFilter, timeout?: number): Promise<StreamMessage> {
        const messages = await this.waitForSentMessages({
            ...opts,
            count: 1
        }, timeout)
        return messages[0]
    }
}
