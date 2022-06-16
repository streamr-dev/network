import { NodeToTracker, Event as NodeToTrackerEvent } from '../protocol/NodeToTracker'
import { PeerId, PeerInfo } from '../connection/PeerInfo'
import { RtcErrorMessage, TrackerId } from '../identifiers'
import { RelayMessage, Originator } from 'streamr-client-protocol'
import { NodeId } from '../identifiers'
import { Logger } from '@streamr/utils'

export interface OfferOptions {
    routerId: string,
    originatorInfo: Originator,
    connectionId: string,
    description: string
}

export interface AnswerOptions {
    routerId: string,
    originatorInfo: Originator,
    connectionId: string,
    description: string
}

export interface IceCandidateOptions {
    routerId: string,
    originatorInfo: Originator
    connectionId: string,
    candidate: string,
    mid: string
}

export interface ConnectOptions {
    routerId: string
    targetNode: NodeId
    originatorInfo: Originator
}

export interface ErrorOptions {
    routerId: string
    targetNode: NodeId
    errorCode: string
}

export class RtcSignaller {
    private readonly peerInfo: PeerInfo
    private readonly nodeToTracker: NodeToTracker
    private offerListener: null | ((opts: OfferOptions) => void)
    private answerListener: null | ((opts: AnswerOptions) => void)
    private iceCandidateListener: null | ((opts: IceCandidateOptions) => void)
    private connectListener: null | ((opts: ConnectOptions) => void)
    private errorListener: null | ((opts: ErrorOptions) => void)
    private readonly logger: Logger

    constructor(peerInfo: PeerInfo, nodeToTracker: NodeToTracker) {
        this.peerInfo = peerInfo
        this.nodeToTracker = nodeToTracker
        this.offerListener = null
        this.answerListener = null
        this.iceCandidateListener = null
        this.connectListener = null
        this.errorListener = null
        this.logger = new Logger(module)

        nodeToTracker.on(NodeToTrackerEvent.RELAY_MESSAGE_RECEIVED, (relayMessage: RelayMessage, source: NodeId) => {
            const { originator, targetNode, subType } = relayMessage
            if (relayMessage.isRtcOfferMessage()) {
                this.offerListener!({
                    routerId: source,
                    originatorInfo: originator,
                    connectionId: relayMessage.data.connectionId,
                    description: relayMessage.data.description
                })
            } else if (relayMessage.isRtcAnswerMessage()) {
                this.answerListener!({
                    routerId: source,
                    originatorInfo: originator,
                    connectionId: relayMessage.data.connectionId,
                    description: relayMessage.data.description,
                })
            } else if (relayMessage.isIceCandidateMessage()) {
                this.iceCandidateListener!({
                    routerId: source,
                    originatorInfo: originator,
                    connectionId: relayMessage.data.connectionId,
                    candidate: relayMessage.data.candidate,
                    mid: relayMessage.data.mid
                })
            } else if (relayMessage.isRtcConnectMessage()) {
                this.connectListener!({
                    routerId: source,
                    targetNode,
                    originatorInfo: originator,
                })
            } else {
                this.logger.warn('unrecognized subtype %s with contents %o', subType, relayMessage)
            }
        })
        nodeToTracker.on(NodeToTrackerEvent.RTC_ERROR_RECEIVED, (message: RtcErrorMessage, source: TrackerId) => {
            this.errorListener!({
                routerId: source,
                targetNode: message.targetNode,
                errorCode: message.errorCode
            })
        })
    }

    sendRtcOffer(routerId: string, targetPeerId: PeerId, connectionId: string, description: string): void {
        this.nodeToTracker.sendRtcOffer(routerId, targetPeerId, connectionId, this.peerInfo, description)
            .catch((err: Error) => {
                this.logger.debug('failed to sendRtcOffer via %s due to %s', routerId, err) // TODO: better?
            })
    }

    sendRtcAnswer(routerId: string, targetPeerId: PeerId, connectionId: string, description: string): void {
        this.nodeToTracker.sendRtcAnswer(routerId, targetPeerId, connectionId, this.peerInfo, description)
            .catch((err: Error) => {
                this.logger.debug('failed to sendRtcAnswer via %s due to %s', routerId, err) // TODO: better?
            })
    }

    sendRtcIceCandidate(routerId: string, targetPeerId: PeerId, connectionId: string, candidate: string, mid: string): void {
        this.nodeToTracker.sendRtcIceCandidate(routerId, targetPeerId, connectionId, this.peerInfo, candidate, mid)
            .catch((err: Error) => {
                this.logger.debug('failed to sendRtcIceCandidate via %s due to %s', routerId, err) // TODO: better?
            })
    }

    sendRtcConnect(routerId: string, targetPeerId: PeerId): void {
        this.nodeToTracker.sendRtcConnect(routerId, targetPeerId, this.peerInfo)
            .catch((err: Error) => {
                this.logger.debug('failed to sendRtcConnect via %s due to %s', routerId, err) // TODO: better?
            })
    }

    setOfferListener(fn: (opts: OfferOptions) => void): void {
        this.offerListener = fn
    }

    setAnswerListener(fn: (opts: AnswerOptions) => void): void {
        this.answerListener = fn
    }

    setIceCandidateListener(fn: (opts: IceCandidateOptions) => void): void {
        this.iceCandidateListener = fn
    }

    setErrorListener(fn: (opts: ErrorOptions) => void): void {
        this.errorListener = fn
    }

    setConnectListener(fn: (opts: ConnectOptions) => void): void {
        this.connectListener = fn
    }
}
