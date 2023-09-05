import { StreamMessage, StreamMessageType } from '@streamr/protocol'
import { NodeID } from '@streamr/trackerless-network'
import { FakeNetworkNode } from './FakeNetworkNode'
import { waitForCondition } from '@streamr/utils'

interface Send {
    message: StreamMessage
    sender: NodeID
    recipients: NodeID[]
}

interface SentMessagesFilter {
    messageType?: StreamMessageType
    count?: number
}

export class FakeNetwork {

    private readonly nodes: Map<NodeID, FakeNetworkNode> = new Map()
    private sends: Send[] = []

    addNode(node: FakeNetworkNode): void {
        if (!this.nodes.has(node.getNodeId())) {
            this.nodes.set(node.getNodeId(), node)
        } else {
            throw new Error(`Duplicate node: ${node.getNodeId()}`)
        }
    }

    removeNode(id: NodeID): void {
        this.nodes.delete(id)
    }

    getNode(id: NodeID): FakeNetworkNode | undefined {
        return this.nodes.get(id)
    }

    getNodes(): FakeNetworkNode[] {
        return Array.from(this.nodes.values())
    }

    send(msg: StreamMessage, sender: NodeID, isRecipient: (networkNode: FakeNetworkNode) => boolean): void {
        const recipients = this.getNodes().filter((n) => isRecipient(n))
        recipients.forEach((n) => {
            n.messageListeners.forEach((listener) => listener(msg))
        })
        this.sends.push({
            message: msg,
            sender,
            recipients: recipients.map((n) => n.getNodeId())
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
