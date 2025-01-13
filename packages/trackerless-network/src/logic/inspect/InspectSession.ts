import { DhtAddress } from '@streamr/dht'
import { toUserId } from '@streamr/utils'
import { EventEmitter } from 'eventemitter3'
import { MessageID } from '../../../generated/packages/trackerless-network/protos/NetworkRpc'

export interface Events {
    done: () => void
}

interface InspectSessionOptions {
    inspectedNode: DhtAddress
}

const createMessageKey = (messageId: MessageID): string => {
    return `${toUserId(messageId.publisherId)}:${messageId.messageChainId}:${messageId.timestamp}:${messageId.sequenceNumber}`
}

export class InspectSession extends EventEmitter<Events> {
    // Boolean indicates if the message has been received by the inspected node
    private readonly inspectionMessages: Map<string, boolean> = new Map()
    private readonly inspectedNode: DhtAddress

    constructor(options: InspectSessionOptions) {
        super()
        this.inspectedNode = options.inspectedNode
    }

    markMessage(remoteNodeId: DhtAddress, messageId: MessageID): void {
        const messageKey = createMessageKey(messageId)
        if (!this.inspectionMessages.has(messageKey)) {
            this.inspectionMessages.set(messageKey, remoteNodeId === this.inspectedNode)
        } else if (
            this.inspectionMessages.has(messageKey) &&
            this.inspectionMessages.get(messageKey) === false &&
            remoteNodeId === this.inspectedNode
        ) {
            this.emit('done')
        } else if (this.inspectionMessages.has(messageKey) && this.inspectionMessages.get(messageKey) === true) {
            this.emit('done')
        }
    }

    getInspectedMessageCount(): number {
        return this.inspectionMessages.size
    }

    onlyMarkedByInspectedNode(): boolean {
        return Array.from(this.inspectionMessages.values()).every((value) => value === true)
    }

    stop(): void {
        this.emit('done')
    }
}
