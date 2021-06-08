import { TrackerNode, Event as TrackerNodeEvent } from '../protocol/TrackerNode'
import { PeerInfo } from '../connection/PeerInfo'
import { RtcSubTypes } from './RtcMessage'
import { RelayMessage, RtcErrorMessage } from '../identifiers'
import { TrackerLayer } from 'streamr-client-protocol'
import { Logger } from "../helpers/Logger"

export interface OfferOptions {
    routerId: string,
    originatorInfo: TrackerLayer.Originator,
    connectionId: string,
    description: string
}

export interface AnswerOptions {
    routerId: string,
    originatorInfo: TrackerLayer.Originator,
    connectionId: string,
    description: string
}

export interface IceCandidateOptions {
    routerId: string,
    originatorInfo: TrackerLayer.Originator
    connectionId: string,
    candidate: string,
    mid: string
}

export interface ConnectOptions {
    routerId: string
    targetNode: string
    originatorInfo: TrackerLayer.Originator
}

export interface ErrorOptions {
    routerId: string
    targetNode: string
    errorCode: string
}

export class RtcSignaller {
    private readonly peerInfo: PeerInfo
    private readonly trackerNode: TrackerNode
    private offerListener: null | ((opts: OfferOptions) => void)
    private answerListener: null | ((opts: AnswerOptions) => void)
    private iceCandidateListener: null | ((opts: IceCandidateOptions) => void)
    private connectListener: null | ((opts: ConnectOptions) => void)
    private errorListener: null | ((opts: ErrorOptions) => void)
    private readonly logger: Logger

    constructor(peerInfo: PeerInfo, trackerNode: TrackerNode) {
        this.peerInfo = peerInfo
        this.trackerNode = trackerNode
        this.offerListener = null
        this.answerListener = null
        this.iceCandidateListener = null
        this.connectListener = null
        this.errorListener = null
        this.logger = new Logger(module)

        trackerNode.on(TrackerNodeEvent.RELAY_MESSAGE_RECEIVED, (relayMessage: RelayMessage, source: string) => {
            const { originator, targetNode, subType } = relayMessage
            if (relayMessage.subType === RtcSubTypes.RTC_OFFER) {
                this.offerListener!({
                    routerId: source,
                    originatorInfo: originator,
                    connectionId: relayMessage.data.connectionId,
                    description: relayMessage.data.description
                })
            } else if (relayMessage.subType === RtcSubTypes.RTC_ANSWER) {
                this.answerListener!({
                    routerId: source,
                    originatorInfo: originator,
                    connectionId: relayMessage.data.connectionId,
                    description: relayMessage.data.description,
                })
            } else if (relayMessage.subType === RtcSubTypes.ICE_CANDIDATE) {
                this.iceCandidateListener!({
                    routerId: source,
                    originatorInfo: originator,
                    connectionId: relayMessage.data.connectionId,
                    candidate: relayMessage.data.candidate,
                    mid: relayMessage.data.mid
                })
            } else if (relayMessage.subType === RtcSubTypes.RTC_CONNECT) {
                this.connectListener!({
                    routerId: source,
                    targetNode,
                    originatorInfo: originator,
                })
            } else {
                this.logger.warn('unrecognized subtype %s with contents %o', subType, relayMessage)
            }
        })
        trackerNode.on(TrackerNodeEvent.RTC_ERROR_RECEIVED, (message: RtcErrorMessage, source: string) => {
            this.errorListener!({
                routerId: source,
                targetNode: message.targetNode,
                errorCode: message.errorCode
            })
        })
    }

    sendRtcOffer(routerId: string, targetPeerId: string, connectionId: string, description: string): void {
        this.trackerNode.sendRtcOffer(routerId, targetPeerId, connectionId, this.peerInfo, description)
            .catch((err: Error) => {
                this.logger.debug('failed to sendRtcOffer via %s due to %s', routerId, err) // TODO: better?
            })
    }

    sendRtcAnswer(routerId: string, targetPeerId: string, connectionId: string, description: string): void {
        this.trackerNode.sendRtcAnswer(routerId, targetPeerId, connectionId, this.peerInfo, description)
            .catch((err: Error) => {
                this.logger.debug('failed to sendRtcAnswer via %s due to %s', routerId, err) // TODO: better?
            })
    }

    sendRtcIceCandidate(routerId: string, targetPeerId: string, connectionId: string, candidate: string, mid: string): void {
        this.trackerNode.sendRtcIceCandidate(routerId, targetPeerId, connectionId, this.peerInfo, candidate, mid)
            .catch((err: Error) => {
                this.logger.debug('failed to sendRtcIceCandidate via %s due to %s', routerId, err) // TODO: better?
            })
    }

    sendRtcConnect(routerId: string, targetPeerId: string): void {
        this.trackerNode.sendRtcConnect(routerId, targetPeerId, this.peerInfo)
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
