import { EventEmitter } from 'events'
import { v4 as uuidv4 } from 'uuid'
import { TrackerLayer } from 'streamr-client-protocol'
import { Logger } from '../helpers/Logger'
import { decode } from '../helpers/MessageEncoder'
import { IWsEndpoint, Event as WsEndpointEvent } from '../connection/IWsEndpoint'
import { RelayMessage, Status } from '../identifiers'
import { PeerInfo } from '../connection/PeerInfo'
import { RtcSubTypes } from '../logic/RtcMessage'
import { NameDirectory } from '../NameDirectory'

export enum Event {
    CONNECTED_TO_TRACKER = 'streamr:tracker-node:send-status',
    TRACKER_DISCONNECTED = 'streamr:tracker-node:tracker-disconnected',
    TRACKER_INSTRUCTION_RECEIVED = 'streamr:tracker-node:tracker-instruction-received',
    RELAY_MESSAGE_RECEIVED = 'streamr:tracker-node:relay-message-received',
    RTC_ERROR_RECEIVED = 'streamr:tracker-node:rtc-error-received',
}

const eventPerType: { [key: number]: string } = {}
eventPerType[TrackerLayer.TrackerMessage.TYPES.InstructionMessage] = Event.TRACKER_INSTRUCTION_RECEIVED
eventPerType[TrackerLayer.TrackerMessage.TYPES.RelayMessage] = Event.RELAY_MESSAGE_RECEIVED
eventPerType[TrackerLayer.TrackerMessage.TYPES.ErrorMessage] = Event.RTC_ERROR_RECEIVED

export interface TrackerNode {
    on(event: Event.CONNECTED_TO_TRACKER, listener: (trackerId: string) => void): this
    on(event: Event.TRACKER_DISCONNECTED, listener: (trackerId: string) => void): this
    on(event: Event.TRACKER_INSTRUCTION_RECEIVED, listener: (msg: TrackerLayer.InstructionMessage, trackerId: string) => void): this
    on(event: Event.RELAY_MESSAGE_RECEIVED, listener: (msg: RelayMessage, trackerId: string) => void): this
    on(event: Event.RTC_ERROR_RECEIVED, listener: (msg: TrackerLayer.ErrorMessage, trackerId: string) => void): this
}

export class TrackerNode extends EventEmitter {
    private readonly endpoint: IWsEndpoint
    private readonly logger: Logger

    constructor(endpoint: IWsEndpoint) {
        super()
        this.endpoint = endpoint
        this.endpoint.on(WsEndpointEvent.PEER_CONNECTED, (peerInfo) => this.onPeerConnected(peerInfo))
        this.endpoint.on(WsEndpointEvent.PEER_DISCONNECTED, (peerInfo) => this.onPeerDisconnected(peerInfo))
        this.endpoint.on(WsEndpointEvent.MESSAGE_RECEIVED, (peerInfo, message) => this.onMessageReceived(peerInfo, message))
        this.logger = new Logger(module)
    }

    sendStatus(trackerId: string, status: Status): Promise<TrackerLayer.StatusMessage> {
        return this.send(trackerId, new TrackerLayer.StatusMessage({
            requestId: uuidv4(),
            status
        }))
    }

    sendRtcOffer(
        trackerId: string,
        targetNode: string, 
        connectionId: string,
        originatorInfo: PeerInfo, 
        description: string
    ): Promise<TrackerLayer.RelayMessage> {
        return this.send(trackerId, new TrackerLayer.RelayMessage({
            requestId: uuidv4(),
            originator: originatorInfo,
            targetNode,
            subType: RtcSubTypes.RTC_OFFER,
            data: {
                connectionId,
                description
            }
        }))
    }

    sendRtcAnswer(
        trackerId: string,
        targetNode: string, 
        connectionId: string,
        originatorInfo: PeerInfo, 
        description: string
    ): Promise<TrackerLayer.RelayMessage> {
        return this.send(trackerId, new TrackerLayer.RelayMessage({
            requestId: uuidv4(),
            originator: originatorInfo,
            targetNode,
            subType: RtcSubTypes.RTC_ANSWER,
            data: {
                connectionId,
                description
            }
        }))
    }

    sendRtcIceCandidate(
        trackerId: string,
        targetNode: string, 
        connectionId: string,
        originatorInfo: PeerInfo,
        candidate: string, 
        mid: string
    ): Promise<TrackerLayer.RelayMessage> {
        return this.send(trackerId, new TrackerLayer.RelayMessage({
            requestId: uuidv4(),
            originator: originatorInfo,
            targetNode,
            subType: RtcSubTypes.ICE_CANDIDATE,
            data: {
                connectionId,
                candidate,
                mid
            }
        }))
    }

    sendRtcConnect(trackerId: string, targetNode: string, originatorInfo: PeerInfo): Promise<TrackerLayer.RelayMessage> {
        return this.send(trackerId, new TrackerLayer.RelayMessage({
            requestId: uuidv4(),
            originator: originatorInfo,
            targetNode,
            subType: RtcSubTypes.RTC_CONNECT,
            data: new Object()
        }))
    }

    send<T>(receiverNodeId: string, message: T & TrackerLayer.TrackerMessage): Promise<T> {
        return this.endpoint.send(receiverNodeId, message.serialize()).then(() => message)
    }

    resolveAddress(trackerId: string): string {
        return this.endpoint.resolveAddress(trackerId)
    }

    stop(): Promise<void> {
        return this.endpoint.stop()
    }

    onMessageReceived(peerInfo: PeerInfo, rawMessage: string): void {
        if (peerInfo.isTracker()) {
            const message = decode<string, TrackerLayer.TrackerMessage>(rawMessage, TrackerLayer.TrackerMessage.deserialize)
            if (message != null) {
                this.emit(eventPerType[message.type], message, peerInfo.peerId)
            } else {
                this.logger.warn('invalid message from %s: %s', peerInfo, rawMessage)
            }
        }
    }

    connectToTracker(trackerAddress: string): Promise<string> {
        return this.endpoint.connect(trackerAddress)
    }

    onPeerConnected(peerInfo: PeerInfo): void {
        this.logger.debug(`Peer connected: ${NameDirectory.getName(peerInfo.peerId)}`)
        if (peerInfo.isTracker()) {
            this.emit(Event.CONNECTED_TO_TRACKER, peerInfo.peerId)
        }
    }

    onPeerDisconnected(peerInfo: PeerInfo): void {
        if (peerInfo.isTracker()) {
            this.emit(Event.TRACKER_DISCONNECTED, peerInfo.peerId)
        }
    }
}
