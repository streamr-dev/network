import { EventEmitter } from 'events'
import { v4 as uuidv4 } from 'uuid'
import { TrackerLayer, TrackerMessageType } from 'streamr-client-protocol'
import { Logger } from '../helpers/Logger'
import { decode } from '../helpers/MessageEncoder'
import { StreamIdAndPartition } from '../identifiers'
import { PeerInfo } from '../connection/PeerInfo'
import { RtcSubTypes } from '../logic/RtcMessage'
import { NameDirectory } from '../NameDirectory'
import { ServerWsEndpoint } from "../connection/ServerWsEndpoint"
import { Event as WsEndpointEvent } from "../connection/AbstractWsEndpoint"

export enum Event {
    NODE_CONNECTED = 'streamr:tracker:send-peers',
    NODE_DISCONNECTED = 'streamr:tracker:node-disconnected',
    NODE_STATUS_RECEIVED = 'streamr:tracker:peer-status',
    RELAY_MESSAGE_RECEIVED = 'streamr:tracker:relay-message-received'
}

const eventPerType: { [key: number]: string } = {}
eventPerType[TrackerLayer.TrackerMessage.TYPES.StatusMessage] = Event.NODE_STATUS_RECEIVED
eventPerType[TrackerLayer.TrackerMessage.TYPES.RelayMessage] = Event.RELAY_MESSAGE_RECEIVED

export interface TrackerNode {
    on(event: Event.NODE_CONNECTED, listener: (nodeId: string) => void): this
    on(event: Event.NODE_DISCONNECTED, listener: (nodeId: string) => void): this
    on(event: Event.NODE_STATUS_RECEIVED, listener: (msg: TrackerLayer.StatusMessage, nodeId: string) => void): this
    on(event: Event.RELAY_MESSAGE_RECEIVED, listener: (msg: TrackerLayer.RelayMessage, nodeId: string) => void): this
}

export class TrackerServer extends EventEmitter {
    private readonly endpoint: ServerWsEndpoint
    private readonly logger: Logger

    constructor(endpoint: ServerWsEndpoint) {
        super()
        this.endpoint = endpoint
        endpoint.on(WsEndpointEvent.PEER_CONNECTED, (peerInfo) => this.onPeerConnected(peerInfo))
        endpoint.on(WsEndpointEvent.PEER_DISCONNECTED, (peerInfo) => this.onPeerDisconnected(peerInfo))
        endpoint.on(WsEndpointEvent.MESSAGE_RECEIVED, (peerInfo, message) => this.onMessageReceived(peerInfo, message))
        this.logger = new Logger(module)
    }

    async sendInstruction(
        receiverNodeId: string, 
        streamId: StreamIdAndPartition, 
        nodeIds: string[], counter: number
    ): Promise<void> {
        await this.send(receiverNodeId, new TrackerLayer.InstructionMessage({
            requestId: uuidv4(),
            streamId: streamId.id,
            streamPartition: streamId.partition,
            nodeIds,
            counter
        }))
    }

    async sendRtcOffer(
        receiverNodeId: string, 
        requestId: string, 
        originatorInfo: TrackerLayer.Originator,
        connectionId: string, 
        description: string
    ): Promise<void> {
        await this.send(receiverNodeId, new TrackerLayer.RelayMessage({
            requestId,
            originator: originatorInfo,
            targetNode: receiverNodeId,
            subType: RtcSubTypes.RTC_OFFER,
            data: {
                connectionId,
                description
            }
        }))
    }

    async sendRtcAnswer(
        receiverNodeId: string, 
        requestId: string, 
        originatorInfo: TrackerLayer.Originator, 
        connectionId: string,
        description: string
    ): Promise<void> {
        await this.send(receiverNodeId, new TrackerLayer.RelayMessage({
            requestId,
            originator: originatorInfo,
            targetNode: receiverNodeId,
            subType: RtcSubTypes.RTC_ANSWER,
            data: {
                connectionId,
                description
            }
        }))
    }

    async sendRtcConnect(
        receiverNodeId: string,
        requestId: string,
        originatorInfo: TrackerLayer.Originator
    ): Promise<void> {
        await this.send(receiverNodeId, new TrackerLayer.RelayMessage({
            requestId,
            originator: originatorInfo,
            targetNode: receiverNodeId,
            subType: RtcSubTypes.RTC_CONNECT,
            data: new Object()
        }))
    }

    async sendRtcIceCandidate(
        receiverNodeId: string,
        requestId: string,
        originatorInfo: TrackerLayer.Originator,
        connectionId: string,
        candidate: string,
        mid: string
    ): Promise<void> {
        await this.send(receiverNodeId, new TrackerLayer.RelayMessage({
            requestId,
            originator: originatorInfo,
            targetNode: receiverNodeId,
            subType: RtcSubTypes.ICE_CANDIDATE,
            data: {
                connectionId,
                candidate,
                mid
            }
        }))
    }

    async sendUnknownPeerRtcError(receiverNodeId: string, requestId: string, targetNode: string): Promise<void> {
        await this.send(receiverNodeId, new TrackerLayer.ErrorMessage({
            requestId,
            errorCode: TrackerLayer.ErrorMessage.ERROR_CODES.RTC_UNKNOWN_PEER,
            targetNode
        }))
    }

    async send<T>(receiverNodeId: string, message: T & TrackerLayer.TrackerMessage): Promise<void> {
        this.logger.debug(`Send ${TrackerMessageType[message.type]} to ${NameDirectory.getName(receiverNodeId)}`)
        await this.endpoint.send(receiverNodeId, message.serialize())
    }

    getNodeIds(): string[] {
        return this.endpoint.getPeerInfos()
            .filter((peerInfo) => peerInfo.isNode())
            .map((peerInfo) => peerInfo.peerId)
    }

    getUrl(): string {
        return this.endpoint.getUrl()
    }

    resolveAddress(peerId: string): string | undefined {
        return this.endpoint.resolveAddress(peerId)
    }

    stop(): Promise<void> {
        return this.endpoint.stop()
    }

    onPeerConnected(peerInfo: PeerInfo): void {
        if (peerInfo.isNode()) {
            this.emit(Event.NODE_CONNECTED, peerInfo.peerId)
        }
    }

    onPeerDisconnected(peerInfo: PeerInfo): void {
        if (peerInfo.isNode()) {
            this.emit(Event.NODE_DISCONNECTED, peerInfo.peerId)
        }
    }

    onMessageReceived(peerInfo: PeerInfo, rawMessage: string): void {
        if (peerInfo.isNode()) {
            const message = decode<string, TrackerLayer.TrackerMessage>(rawMessage, TrackerLayer.TrackerMessage.deserialize)
            if (message != null) {
                this.emit(eventPerType[message.type], message, peerInfo.peerId)
            } else {
                this.logger.warn('invalid message from %s: %s', peerInfo, rawMessage)
            }
        }
    }
}
