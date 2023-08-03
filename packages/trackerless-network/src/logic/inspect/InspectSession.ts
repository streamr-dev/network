import { EventEmitter } from 'eventemitter3'
import { MessageRef } from '../../proto/packages/trackerless-network/protos/NetworkRpc'
import { PeerIDKey } from '@streamr/dht'

export interface Events {
    done: () => void
}

interface InspectSessionConfig {
    inspectedPeer: PeerIDKey
}

export class InspectSession extends EventEmitter<Events> {
    
    // Boolean indicates if the message has been received by the inspected node
    private readonly inspectionMessages: Map<string, boolean> = new Map()
    private readonly inspectedPeer: PeerIDKey

    constructor(config: InspectSessionConfig) {
        super()
        this.inspectedPeer = config.inspectedPeer
    }

    markMessage(senderId: PeerIDKey, messageRef: MessageRef): void {
        const messageKey = this.createMessageKey(messageRef)
        if (!this.inspectionMessages.has(messageKey)) {
            this.inspectionMessages.set(messageKey, senderId === this.inspectedPeer)
        } else if (this.inspectionMessages.has(messageKey)
            && this.inspectionMessages.get(messageKey) === false
            && senderId === this.inspectedPeer
        ) {
            this.emit('done')
        } else if (this.inspectionMessages.has(messageKey)
            && this.inspectionMessages.get(messageKey) === true) {
            this.emit('done')
        }
    }

    private createMessageKey(messageRef: MessageRef): string {
        return `${messageRef.messageChainId}:${messageRef.timestamp}:${messageRef.sequenceNumber}`
    }

    getInspectedMessageCount(): number {
        return this.inspectionMessages.size
    }

    stop(): void {
        this.emit('done')
    }
}