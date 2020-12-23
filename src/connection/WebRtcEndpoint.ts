import { EventEmitter } from 'events'
import nodeDataChannel, { DescriptionType } from 'node-datachannel'
import getLogger from '../helpers/logger'
import { PeerInfo } from './PeerInfo'
import { Connection } from './Connection'
import { Metrics, MetricsContext } from "../helpers/MetricsContext";
import {
    AnswerOptions,
    ConnectOptions,
    ErrorOptions,
    OfferOptions,
    RemoteCandidateOptions,
    RtcSignaller
} from "../logic/RtcSignaller"
import { Rtts } from "../identifiers"
import pino from "pino"

export enum Event {
    PEER_CONNECTED = 'streamr:peer:connect',
    PEER_DISCONNECTED = 'streamr:peer:disconnect',
    MESSAGE_RECEIVED = 'streamr:message-received',
    HIGH_BACK_PRESSURE = 'streamr:high-back-pressure',
    LOW_BACK_PRESSURE = 'streamr:low-back-pressure'
}

class WebRtcError extends Error {
    constructor(msg: string) {
        super(msg)
        // exclude this constructor from stack trace
        Error.captureStackTrace(this, WebRtcError)
    }
}

// Declare event handlers
export declare interface WebRtcEndpoint {
    on(event: Event.PEER_CONNECTED, listener: (peerInfo: PeerInfo) => void): this
    on(event: Event.PEER_DISCONNECTED, listener: (peerInfo: PeerInfo) => void): this
    on(event: Event.MESSAGE_RECEIVED, listener: (peerInfo: PeerInfo, message: string) => void): this
    on(event: Event.HIGH_BACK_PRESSURE, listener: (peerInfo: PeerInfo) => void): this
    on(event: Event.LOW_BACK_PRESSURE, listener: (peerInfo: PeerInfo) => void): this
}

export class WebRtcEndpoint extends EventEmitter {
    private readonly id: string
    private readonly stunUrls: string[]
    private readonly rtcSignaller: RtcSignaller
    private connections: { [key: string]: Connection }
    private readonly newConnectionTimeout: number
    private readonly pingIntervalInMs: number
    private pingTimeoutRef: NodeJS.Timeout
    private readonly logger: pino.Logger
    private readonly metrics: Metrics
    private stopped: boolean = false

    constructor(
        id: string,
        stunUrls: string[],
        rtcSignaller: RtcSignaller,
        metricsContext: MetricsContext,
        pingIntervalInMs = 5 * 1000,
        newConnectionTimeout = 5000
    ) {
        super()
        this.id = id
        this.stunUrls = stunUrls
        this.rtcSignaller = rtcSignaller
        this.connections = {}
        this.newConnectionTimeout = newConnectionTimeout
        this.pingIntervalInMs = pingIntervalInMs
        this.pingTimeoutRef = setTimeout(() => this.pingConnections(), this.pingIntervalInMs)
        this.logger = getLogger(`streamr:WebRtcEndpoint:${id}`)

        rtcSignaller.setOfferListener(async ({ routerId, originatorInfo, description } : OfferOptions) => {
            const { peerId } = originatorInfo
            this.connect(peerId, routerId).catch((err) => {
                this.logger.warn('offerListener connection failed %s', err)
            })
            const connection = this.connections[peerId]
            if (connection) {
                connection.setPeerInfo(PeerInfo.fromObject(originatorInfo))
                connection.setRemoteDescription(description, 'offer' as DescriptionType.Offer)
            }
        })

        rtcSignaller.setAnswerListener(({ originatorInfo, description }: AnswerOptions) => {
            const { peerId } = originatorInfo
            const connection = this.connections[peerId]
            if (connection) {
                connection.setPeerInfo(PeerInfo.fromObject(originatorInfo))
                connection.setRemoteDescription(description, 'answer' as DescriptionType.Answer)
            } else {
                this.logger.warn('Unexpected rtcAnswer from %s: %s', originatorInfo, description)
            }
        })

        rtcSignaller.setRemoteCandidateListener(({ originatorInfo, candidate, mid }: RemoteCandidateOptions) => {
            const { peerId } = originatorInfo
            const connection = this.connections[peerId]
            if (connection) {
                connection.addRemoteCandidate(candidate, mid)
            } else {
                this.logger.warn('Unexpected remoteCandidate from %s: [%s, %s]', originatorInfo, candidate, mid)
            }
        })

        rtcSignaller.setConnectListener(async ({ originatorInfo, routerId }: ConnectOptions) => {
            const { peerId } = originatorInfo
            this.connect(peerId, routerId, false).catch((err) => {
                this.logger.warn('connectListener connection failed %s', err)
            })
        })

        rtcSignaller.setErrorListener(({ targetNode, errorCode }: ErrorOptions) => {
            const error = new WebRtcError(`RTC error ${errorCode} while attempting to signal with ${targetNode}`)
            this.emit(`errored:${targetNode}`, error)
        })

        this.metrics = metricsContext.create('WebRtcEndpoint')
            .addRecordedMetric('inSpeed')
            .addRecordedMetric('outSpeed')
            .addRecordedMetric('msgSpeed')
            .addRecordedMetric('msgInSpeed')
            .addRecordedMetric('msgOutSpeed')
            .addRecordedMetric('open')
            .addRecordedMetric('close')
            .addRecordedMetric('sendFailed')
            .addQueriedMetric('connections', () => Object.keys(this.connections).length)
            .addQueriedMetric('pendingConnections', () => {
                return Object.values(this.connections).filter((c) => !c.isOpen()).length
            })
            .addQueriedMetric('totalWebSocketBuffer', () => {
                return Object.values(this.connections).reduce((total, c) => total + c.getBufferedAmount(), 0)
            })
            .addQueriedMetric('messageQueueSize', () => {
                return Object.values(this.connections).reduce((total, c) => total + c.getQueueSize(), 0)
            })
    }

    connect(
        targetPeerId: string,
        routerId: string,
        isOffering = this.id < targetPeerId,
        trackerInstructed = true
    ): Promise<string> {
        // Prevent new connections from being opened when WebRtcEndpoint has been closed
        if (this.stopped) {
            return Promise.reject(new WebRtcError('WebRtcEndpoint has been stopped'))
        }
        if (this.connections[targetPeerId]) {
            return Promise.resolve(targetPeerId)
        }
        const connection = new Connection({
            selfId: this.id,
            targetPeerId,
            routerId,
            isOffering,
            stunUrls: this.stunUrls,
            newConnectionTimeout: this.newConnectionTimeout,
            onLocalDescription: (type, description) => {
                this.rtcSignaller.onLocalDescription(routerId, connection.getPeerId(), type, description)
            },
            onLocalCandidate: (candidate, mid) => {
                this.rtcSignaller.onLocalCandidate(routerId, connection.getPeerId(), candidate, mid)
            },
            onOpen: () => {
                this.emit(Event.PEER_CONNECTED, connection.getPeerInfo())
                this.emit(`connected:${connection.getPeerId()}`, connection.getPeerId())
                this.metrics.record('open', 1)
            },
            onMessage: (message) => {
                this.emit(Event.MESSAGE_RECEIVED, connection.getPeerInfo(), message)
                this.metrics.record('inSpeed', message.length)
                this.metrics.record('msgSpeed', 1)
                this.metrics.record('msgInSpeed', 1)
            },
            onClose: () => {
                this.emit(Event.PEER_DISCONNECTED, connection.getPeerInfo())
                const err = new Error(`disconnected ${connection.getPeerId()}`)
                this.emit(`disconnected:${connection.getPeerId()}`, err)
                this.metrics.record('close', 1)
                delete this.connections[targetPeerId]
            },
            onError: (err) => {
                this.emit(`errored:${connection.getPeerId()}`, err)
            },
            onBufferLow: () => {
                this.emit(Event.LOW_BACK_PRESSURE, connection.getPeerInfo())
            },
            onBufferHigh: () => {
                this.emit(Event.HIGH_BACK_PRESSURE, connection.getPeerInfo())
            }
        })
        this.connections[targetPeerId] = connection
        connection.connect()
        if (!trackerInstructed && isOffering) {
            this.rtcSignaller.onConnectionNeeded(routerId, connection.getPeerId())
        }
        return new Promise((resolve, reject) => {
            this.once(`connected:${connection.getPeerId()}`, resolve)
            this.once(`errored:${connection.getPeerId()}`, reject)
            this.once(`disconnected:${connection.getPeerId()}`, reject)
        })
    }

    send(targetPeerId: string, message: string): Promise<void> {
        if (!this.connections[targetPeerId]) {
            return Promise.reject(new WebRtcError(`Not connected to ${targetPeerId}.`))
        }
        return this.connections[targetPeerId].send(message)
            .then(() => {
                this.metrics.record('outSpeed', message.length)
                this.metrics.record('msgSpeed', 1)
                this.metrics.record('msgOutSpeed', 1)
            })
            .catch((err) => {
                this.metrics.record('sendFailed', 1)
                throw err
            })
    }

    close(receiverNodeId: string, reason: string): void {
        this.logger.debug('Close %s because %s', receiverNodeId, reason)
        const connection = this.connections[receiverNodeId]
        if (connection) {
            connection.close()
        }
    }

    getRtts(): Readonly<Rtts> {
        const rtts: Rtts = {}
        Object.entries(this.connections).forEach(([targetPeerId, connection]) => {
            const rtt = connection.getRtt()
            if (rtt !== undefined && rtt !== null) {
                rtts[targetPeerId] = rtt
            }
        })
        return rtts
    }

    getAddress(): string {
        return this.id
    }

    stop(): void {
        this.stopped = true
        Object.values(this.connections).forEach((connection) => connection.close())
        clearTimeout(this.pingTimeoutRef)
        this.connections = {}
        this.rtcSignaller.setOfferListener(() => {})
        this.rtcSignaller.setAnswerListener(() => {})
        this.rtcSignaller.setRemoteCandidateListener(() => {})
        this.rtcSignaller.setErrorListener(() => {})
        this.rtcSignaller.setConnectListener(() => {})
        this.removeAllListeners()
        nodeDataChannel.cleanup()
    }

    private pingConnections(): void {
        const connections = Object.values(this.connections)
        connections.forEach((connection) => connection.ping())
        this.pingTimeoutRef = setTimeout(() => this.pingConnections(), this.pingIntervalInMs)
    }
}
