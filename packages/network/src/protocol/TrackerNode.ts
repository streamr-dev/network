import { EventEmitter } from 'events'
import { v4 as uuidv4 } from 'uuid'
import { TrackerLayer } from 'streamr-client-protocol'
import { Logger } from '../helpers/Logger'
import { decode } from '../helpers/MessageEncoder'
import { RelayMessage, Status } from '../identifiers'
import { PeerInfo } from '../connection/PeerInfo'
import { RtcSubTypes } from '../logic/RtcMessage'
import { NameDirectory } from '../NameDirectory'
import { NodeClientWsEndpoint } from "../connection/ws/NodeClientWsEndpoint"
import { Event as WsEndpointEvent } from "../connection/ws/AbstractWsEndpoint"

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

export type UUID = string

export class TrackerNode extends EventEmitter {
    private readonly endpoint: NodeClientWsEndpoint
    private readonly logger: Logger

    // ServerWsEndpoint
    constructor(endpoint: NodeClientWsEndpoint) {
        super()
        this.endpoint = endpoint
        this.endpoint.on(WsEndpointEvent.PEER_CONNECTED, (peerInfo) => this.onPeerConnected(peerInfo))
        this.endpoint.on(WsEndpointEvent.PEER_DISCONNECTED, (peerInfo) => this.onPeerDisconnected(peerInfo))
        this.endpoint.on(WsEndpointEvent.MESSAGE_RECEIVED, (peerInfo, message) => this.onMessageReceived(peerInfo, message))
        this.logger = new Logger(module)
    }

    async sendStatus(trackerId: string, status: Status): Promise<UUID> {
        const requestId = uuidv4()
        await this.send(trackerId, new TrackerLayer.StatusMessage({
            requestId,
            status
        }))
        return requestId
    }

    async sendRtcOffer(
        trackerId: string,
        targetNode: string, 
        connectionId: string,
        originatorInfo: PeerInfo, 
        description: string
    ): Promise<UUID> {
        const requestId = uuidv4()
        await this.send(trackerId, new TrackerLayer.RelayMessage({
            requestId,
            originator: originatorInfo,
            targetNode,
            subType: RtcSubTypes.RTC_OFFER,
            data: {
                connectionId,
                description
            }
        }))
        return requestId
    }

    async sendRtcAnswer(
        trackerId: string,
        targetNode: string, 
        connectionId: string,
        originatorInfo: PeerInfo, 
        description: string
    ): Promise<UUID> {
        const requestId = uuidv4()
        await this.send(trackerId, new TrackerLayer.RelayMessage({
            requestId,
            originator: originatorInfo,
            targetNode,
            subType: RtcSubTypes.RTC_ANSWER,
            data: {
                connectionId,
                description
            }
        }))
        return requestId
    }

    async sendRtcIceCandidate(
        trackerId: string,
        targetNode: string, 
        connectionId: string,
        originatorInfo: PeerInfo,
        candidate: string, 
        mid: string
    ): Promise<UUID> {
        const requestId = uuidv4()
        await this.send(trackerId, new TrackerLayer.RelayMessage({
            requestId,
            originator: originatorInfo,
            targetNode,
            subType: RtcSubTypes.ICE_CANDIDATE,
            data: {
                connectionId,
                candidate,
                mid
            }
        }))
        return requestId
    }

    async sendRtcConnect(trackerId: string, targetNode: string, originatorInfo: PeerInfo): Promise<UUID> {
        const requestId = uuidv4()
        await this.send(trackerId, new TrackerLayer.RelayMessage({
            requestId,
            originator: originatorInfo,
            targetNode,
            subType: RtcSubTypes.RTC_CONNECT,
            data: new Object()
        }))
        return requestId
    }

    async send<T>(receiverNodeId: string, message: T & TrackerLayer.TrackerMessage): Promise<void> {
        await this.endpoint.send(receiverNodeId, message.serialize())
    }

    getServerUrlByTrackerId(trackerId: string): string | undefined {
        return this.endpoint.getServerUrlByPeerId(trackerId)
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
                this.logger.warn('invalid message from %s: "%s"', peerInfo, rawMessage)
            }
        }
    }

    connectToTracker(trackerAddress: string, trackerPeerInfo: PeerInfo): Promise<string> {
        return this.endpoint.connect(trackerAddress, trackerPeerInfo)
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
