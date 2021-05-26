import { EventEmitter } from 'events'
import { v4 as uuidv4 } from 'uuid'
import { TrackerLayer, TrackerMessageType } from 'streamr-client-protocol'
import { Logger } from '../helpers/Logger'
import { decode } from '../helpers/MessageEncoder'
import { IWsEndpoint, Event as WsEndpointEvent } from '../connection/IWsEndpoint'
import { StreamIdAndPartition } from '../identifiers'
import { PeerInfo } from '../connection/PeerInfo'
import { RtcSubTypes } from '../logic/RtcMessage'
import { NameDirectory } from '../NameDirectory'

export enum Event {
    NODE_CONNECTED = 'streamr:tracker:send-peers',
    NODE_DISCONNECTED = 'streamr:tracker:node-disconnected',
    NODE_STATUS_RECEIVED = 'streamr:tracker:peer-status',
    STORAGE_NODES_REQUEST = 'streamr:tracker:find-storage-nodes-request',
    RELAY_MESSAGE_RECEIVED = 'streamr:tracker:relay-message-received'
}

const eventPerType: { [key: number]: string } = {}
eventPerType[TrackerLayer.TrackerMessage.TYPES.StatusMessage] = Event.NODE_STATUS_RECEIVED
eventPerType[TrackerLayer.TrackerMessage.TYPES.StorageNodesRequest] = Event.STORAGE_NODES_REQUEST
eventPerType[TrackerLayer.TrackerMessage.TYPES.RelayMessage] = Event.RELAY_MESSAGE_RECEIVED

export interface TrackerNode {
    on(event: Event.NODE_CONNECTED, listener: (nodeId: string, isStorage: boolean) => void): this
    on(event: Event.NODE_DISCONNECTED, listener: (nodeId: string, isStorage: boolean) => void): this
    on(event: Event.NODE_STATUS_RECEIVED, listener: (msg: TrackerLayer.StatusMessage, nodeId: string) => void): this
    on(event: Event.STORAGE_NODES_REQUEST, listener: (msg: TrackerLayer.StorageNodesRequest, nodeId: string) => void): this
    on(event: Event.RELAY_MESSAGE_RECEIVED, listener: (msg: TrackerLayer.RelayMessage, nodeId: string) => void): this
}

export class TrackerServer extends EventEmitter {
    private readonly endpoint: IWsEndpoint
    private readonly logger: Logger

    constructor(endpoint: IWsEndpoint) {
        super()
        this.endpoint = endpoint
        endpoint.on(WsEndpointEvent.PEER_CONNECTED, (peerInfo) => this.onPeerConnected(peerInfo))
        endpoint.on(WsEndpointEvent.PEER_DISCONNECTED, (peerInfo) => this.onPeerDisconnected(peerInfo))
        endpoint.on(WsEndpointEvent.MESSAGE_RECEIVED, (peerInfo, message) => this.onMessageReceived(peerInfo, message))
        this.logger = new Logger(module)
    }

    sendInstruction(
        receiverNodeId: string, 
        streamId: StreamIdAndPartition, 
        nodeIds: string[], counter: number
    ): Promise<TrackerLayer.InstructionMessage> {
        return this.send(receiverNodeId, new TrackerLayer.InstructionMessage({
            requestId: uuidv4(),
            streamId: streamId.id,
            streamPartition: streamId.partition,
            nodeIds,
            counter
        }))
    }

    sendStorageNodesResponse(receiverNodeId: string, streamId: StreamIdAndPartition, nodeIds: string[]): Promise<TrackerLayer.StorageNodesResponse> {
        return this.send(receiverNodeId, new TrackerLayer.StorageNodesResponse({
            requestId: '', // TODO: set requestId
            streamId: streamId.id,
            streamPartition: streamId.partition,
            nodeIds
        }))
    }

    sendRtcOffer(
        receiverNodeId: string, 
        requestId: string, 
        originatorInfo: TrackerLayer.Originator, 
        description: string
    ): Promise<TrackerLayer.RelayMessage> {
        return this.send(receiverNodeId, new TrackerLayer.RelayMessage({
            requestId,
            originator: originatorInfo,
            targetNode: receiverNodeId,
            subType: RtcSubTypes.RTC_OFFER,
            data: {
                description
            }
        }))
    }

    sendRtcAnswer(
        receiverNodeId: string, 
        requestId: string, 
        originatorInfo: TrackerLayer.Originator, 
        description: string
    ): Promise<TrackerLayer.RelayMessage> {
        return this.send(receiverNodeId, new TrackerLayer.RelayMessage({
            requestId,
            originator: originatorInfo,
            targetNode: receiverNodeId,
            subType: RtcSubTypes.RTC_ANSWER,
            data: {
                description
            }
        }))
    }

    sendRtcConnect(
        receiverNodeId: string,
        requestId: string,
        originatorInfo: TrackerLayer.Originator
    ): Promise<TrackerLayer.RelayMessage> {
        return this.send(receiverNodeId, new TrackerLayer.RelayMessage({
            requestId,
            originator: originatorInfo,
            targetNode: receiverNodeId,
            subType: RtcSubTypes.RTC_CONNECT,
            data: new Object()
        }))
    }

    sendRemoteCandidate(
        receiverNodeId: string,
        requestId: string,
        originatorInfo: TrackerLayer.Originator,
        candidate: string,
        mid: string
    ): Promise<TrackerLayer.RelayMessage> {
        return this.send(receiverNodeId, new TrackerLayer.RelayMessage({
            requestId,
            originator: originatorInfo,
            targetNode: receiverNodeId,
            subType: RtcSubTypes.REMOTE_CANDIDATE,
            data: {
                candidate,
                mid
            }
        }))
    }

    sendUnknownPeerRtcError(receiverNodeId: string, requestId: string, targetNode: string): Promise<TrackerLayer.ErrorMessage> {
        return this.send(receiverNodeId, new TrackerLayer.ErrorMessage({
            requestId,
            errorCode: TrackerLayer.ErrorMessage.ERROR_CODES.RTC_UNKNOWN_PEER,
            targetNode
        }))
    }

    send<T>(receiverNodeId: string, message: T & TrackerLayer.TrackerMessage): Promise<T> {
        this.logger.debug(`Send ${TrackerMessageType[message.type]} to ${NameDirectory.getName(receiverNodeId)}`)
        return this.endpoint.send(receiverNodeId, message.serialize()).then(() => message)
    }

    getNodeIds(): string[] {
        return this.endpoint.getPeerInfos()
            .filter((peerInfo) => peerInfo.isNode())
            .map((peerInfo) => peerInfo.peerId)
    }

    getAddress(): string {
        return this.endpoint.getAddress()
    }

    resolveAddress(peerId: string): string {
        return this.endpoint.resolveAddress(peerId)
    }

    stop(): Promise<void> {
        return this.endpoint.stop()
    }

    onPeerConnected(peerInfo: PeerInfo): void {
        if (peerInfo.isNode()) {
            this.emit(Event.NODE_CONNECTED, peerInfo.peerId, peerInfo.isStorage())
        }
    }

    onPeerDisconnected(peerInfo: PeerInfo): void {
        if (peerInfo.isNode()) {
            this.emit(Event.NODE_DISCONNECTED, peerInfo.peerId, peerInfo.isStorage())
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
