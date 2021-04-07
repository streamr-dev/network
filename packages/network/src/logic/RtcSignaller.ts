import { TrackerNode, Event as TrackerNodeEvent } from '../protocol/TrackerNode'
import { PeerInfo } from '../connection/PeerInfo'
import { RtcSubTypes } from './RtcMessage'
import { RelayMessage, RtcErrorMessage } from '../identifiers'
import { DescriptionType } from 'node-datachannel'
import { TrackerLayer } from 'streamr-client-protocol'
import { Logger } from "../helpers/Logger"

export interface OfferOptions {
    routerId: string,
    originatorInfo: TrackerLayer.Originator,
    description: string
}

export interface AnswerOptions {
    routerId: string,
    originatorInfo: TrackerLayer.Originator,
    description: string
}

export interface RemoteCandidateOptions {
    routerId: string,
    originatorInfo: TrackerLayer.Originator
    candidate: string,
    mid: string
}

export interface ConnectOptions {
    routerId: string
    targetNode: string
    originatorInfo: TrackerLayer.Originator
    force: boolean
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
    private remoteCandidateListener: null | ((opts: RemoteCandidateOptions) => void)
    private connectListener: null | ((opts: ConnectOptions) => void)
    private errorListener: null | ((opts: ErrorOptions) => void)
    private readonly logger: Logger

    constructor(peerInfo: PeerInfo, trackerNode: TrackerNode) {
        this.peerInfo = peerInfo
        this.trackerNode = trackerNode
        this.offerListener = null
        this.answerListener = null
        this.remoteCandidateListener = null
        this.connectListener = null
        this.errorListener = null
        this.logger = new Logger(['RtcSignaller'], peerInfo)

        trackerNode.on(TrackerNodeEvent.RELAY_MESSAGE_RECEIVED, (relayMessage: RelayMessage, source: string) => {
            const { originator, targetNode, subType } = relayMessage
            if (relayMessage.subType === RtcSubTypes.RTC_OFFER) {
                this.offerListener!({
                    routerId: source,
                    originatorInfo: originator,
                    description: relayMessage.data.description
                })
            } else if (relayMessage.subType === RtcSubTypes.RTC_ANSWER) {
                this.answerListener!({
                    routerId: source,
                    originatorInfo: originator,
                    description: relayMessage.data.description,
                })
            } else if (relayMessage.subType === RtcSubTypes.REMOTE_CANDIDATE) {
                this.remoteCandidateListener!({
                    routerId: source,
                    originatorInfo: originator,
                    candidate: relayMessage.data.candidate,
                    mid: relayMessage.data.mid
                })
            } else if (relayMessage.subType === RtcSubTypes.RTC_CONNECT) {
                this.connectListener!({
                    routerId: source,
                    targetNode,
                    originatorInfo: originator,
                    force: relayMessage.data.force
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

    onLocalDescription(routerId: string, targetPeerId: string, type: DescriptionType, description: string): void {
        this.trackerNode.sendLocalDescription(routerId, targetPeerId, this.peerInfo, type, description)
            .catch((err: Error) => {
                this.logger.debug('failed to sendLocalDescription via %s due to %s', routerId, err) // TODO: better?
            })
    }

    onLocalCandidate(routerId: string, targetPeerId: string, candidate: string, mid: string): void {
        this.trackerNode.sendLocalCandidate(routerId, targetPeerId, this.peerInfo, candidate, mid)
            .catch((err: Error) => {
                this.logger.debug('failed to sendLocalCandidate via %s due to %s', routerId, err) // TODO: better?
            })
    }

    onConnectionNeeded(routerId: string, targetPeerId: string, force: boolean): void {
        this.trackerNode.sendRtcConnect(routerId, targetPeerId, this.peerInfo, force)
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

    setRemoteCandidateListener(fn: (opts: RemoteCandidateOptions) => void): void {
        this.remoteCandidateListener = fn
    }

    setErrorListener(fn: (opts: ErrorOptions) => void): void {
        this.errorListener = fn
    }

    setConnectListener(fn: (opts: ConnectOptions) => void): void {
        this.connectListener = fn
    }
}
