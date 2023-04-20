import { EventEmitter } from 'events'
import { Event, IWebRtcEndpoint } from './IWebRtcEndpoint'
import { Logger } from "@streamr/utils"
import { PeerId, PeerInfo } from '../PeerInfo'
import { DeferredConnectionAttempt } from './DeferredConnectionAttempt'
import { WebRtcConnection, ConstructorOptions, isOffering, IceServer, WebRtcPortRange } from './WebRtcConnection'
import { CountMetric, LevelMetric, Metric, MetricsContext, MetricsDefinition, RateMetric } from '@streamr/utils'
import {
    AnswerOptions,
    ConnectOptions,
    ErrorOptions,
    OfferOptions,
    IceCandidateOptions,
    RtcSignaller
} from '../../logic/RtcSignaller'
import { Rtts } from '../../identifiers'
import { MessageQueue } from '../MessageQueue'
import { NameDirectory } from '../../NameDirectory'
import { NegotiatedProtocolVersions } from '../NegotiatedProtocolVersions'
import { v4 as uuidv4 } from 'uuid'
import { getAddressFromIceCandidate, isPrivateIPv4 } from '../../helpers/AddressTools'

class WebRtcError extends Error {
}

interface WebRtcEndpointMetrics extends MetricsDefinition {
    sendMessagesPerSecond: Metric
    sendBytesPerSecond: Metric
    receiveMessagesPerSecond: Metric
    receiveBytesPerSecond: Metric
    connectionAverageCount: Metric
    connectionTotalFailureCount: Metric
}

export interface WebRtcConnectionFactory {
    createConnection(opts: ConstructorOptions): WebRtcConnection
    registerWebRtcEndpoint(): void
    unregisterWebRtcEndpoint(): void
}

const logger = new Logger(module)

export class WebRtcEndpoint extends EventEmitter implements IWebRtcEndpoint {
    private readonly peerInfo: PeerInfo
    private readonly iceServers: ReadonlyArray<IceServer>
    private readonly rtcSignaller: RtcSignaller
    private readonly negotiatedProtocolVersions: NegotiatedProtocolVersions
    private readonly connectionFactory: WebRtcConnectionFactory
    private connections: Record<string, WebRtcConnection>
    private messageQueues: Record<string, MessageQueue<string>>
    private readonly newConnectionTimeout: number
    private readonly pingInterval: number
    private readonly metrics: WebRtcEndpointMetrics
    private stopped = false
    private readonly bufferThresholdLow: number
    private readonly bufferThresholdHigh: number
    private readonly sendBufferMaxMessageCount: number
    private readonly disallowPrivateAddresses: boolean
    private readonly maxMessageSize: number
    private readonly portRange: WebRtcPortRange

    private statusReportTimer?: NodeJS.Timeout

    constructor(
        peerInfo: PeerInfo,
        iceServers: ReadonlyArray<IceServer>,
        rtcSignaller: RtcSignaller,
        metricsContext: MetricsContext,
        negotiatedProtocolVersions: NegotiatedProtocolVersions,
        connectionFactory: WebRtcConnectionFactory,
        newConnectionTimeout: number,
        pingInterval: number,
        webrtcDatachannelBufferThresholdLow: number,
        webrtcDatachannelBufferThresholdHigh: number,
        webrtcSendBufferMaxMessageCount: number,
        webrtcDisallowPrivateAddresses: boolean,
        portRange: WebRtcPortRange,
        maxMessageSize: number,
    ) {
        super()
        this.peerInfo = peerInfo
        this.iceServers = iceServers
        this.rtcSignaller = rtcSignaller
        this.negotiatedProtocolVersions = negotiatedProtocolVersions
        this.connectionFactory = connectionFactory
        this.connections = {}
        this.messageQueues = {}
        this.newConnectionTimeout = newConnectionTimeout
        this.pingInterval = pingInterval
        this.bufferThresholdLow = webrtcDatachannelBufferThresholdLow
        this.bufferThresholdHigh = webrtcDatachannelBufferThresholdHigh
        this.sendBufferMaxMessageCount = webrtcSendBufferMaxMessageCount
        this.disallowPrivateAddresses = webrtcDisallowPrivateAddresses
        this.maxMessageSize = maxMessageSize
        this.portRange = portRange

        this.connectionFactory.registerWebRtcEndpoint()

        rtcSignaller.setOfferListener(async (options: OfferOptions) => {
            this.onRtcOfferFromSignaller(options)
        })

        rtcSignaller.setAnswerListener((options: AnswerOptions) => {
            this.onRtcAnswerFromSignaller(options)
        })

        rtcSignaller.setIceCandidateListener((options: IceCandidateOptions) => {
            this.onIceCandidateFromSignaller(options)
        })

        rtcSignaller.setConnectListener(async (options: ConnectOptions) => {
            this.onConnectFromSignaller(options)
        })

        rtcSignaller.setErrorListener((options: ErrorOptions) => {
            this.onErrorFromSignaller(options)
        })

        this.metrics = {
            sendMessagesPerSecond: new RateMetric(),
            sendBytesPerSecond: new RateMetric(),
            receiveMessagesPerSecond: new RateMetric(),
            receiveBytesPerSecond: new RateMetric(),
            connectionAverageCount: new LevelMetric(0),
            connectionTotalFailureCount: new CountMetric()
        }
        metricsContext.addMetrics('node', this.metrics)

        this.startConnectionStatusReport()
    }

    private startConnectionStatusReport(): void {
        const getPeerNameList = (peerIds: PeerId[]) => {
            return peerIds.map((peerId) => NameDirectory.getName(peerId)).join(',')
        }
        const STATUS_REPORT_INTERVAL_MS = 5 * 60 * 1000
        this.statusReportTimer = setInterval(() => {
            const connectedPeerIds = []
            const pendingPeerIds = []
            const undefinedStates = []
            const connections = Object.keys(this.connections)
            for (const peerId of connections) {
                const lastState = this.connections[peerId].getLastState()
                if (lastState === 'connected') {
                    connectedPeerIds.push(peerId)
                } else if (lastState === 'connecting') {
                    pendingPeerIds.push(peerId)
                } else if (lastState === undefined) {
                    undefinedStates.push(peerId)
                }
            }
            if (connections.length > 0 && connections.length === undefinedStates.length) {
                logger.warn('Failed to determine WebRTC datachannel connection states')
            } else {
                const suffix = (pendingPeerIds.length > 0) ? ` (trying to connect to ${pendingPeerIds.length} peers)` : ''
                logger.info(`Connected to ${connectedPeerIds.length} peers${suffix}`)
                logger.debug(`Connected to peers: ${getPeerNameList(connectedPeerIds) || '[]'}`)
                logger.debug(`Connect to peers (pending): ${getPeerNameList(pendingPeerIds) || '[]'}`)
            }
        }, STATUS_REPORT_INTERVAL_MS)
    }

    private createConnection(
        targetPeerId: PeerId,
        routerId: string,
        deferredConnectionAttempt: DeferredConnectionAttempt | null
    ) {
        const messageQueue = this.messageQueues[targetPeerId] = this.messageQueues[targetPeerId] || new MessageQueue(this.sendBufferMaxMessageCount)
        const connectionOptions: ConstructorOptions = {
            selfId: this.peerInfo.peerId,
            targetPeerId,
            routerId,
            iceServers: this.iceServers,
            bufferThresholdHigh: this.bufferThresholdHigh,
            bufferThresholdLow: this.bufferThresholdLow,
            messageQueue,
            deferredConnectionAttempt: deferredConnectionAttempt || new DeferredConnectionAttempt(),
            newConnectionTimeout: this.newConnectionTimeout,
            pingInterval: this.pingInterval,
            portRange: this.portRange,
            maxMessageSize: this.maxMessageSize
        }

        const connection = this.connectionFactory.createConnection(connectionOptions)

        if (connection.isOffering()) {
            connection.once('localDescription', (_type, description) => {
                this.rtcSignaller.sendRtcOffer(routerId, connection.getPeerId(), connection.getConnectionId(), description)
                this.attemptProtocolVersionValidation(connection)
            })
        } else {
            connection.once('localDescription', (_type, description) => {
                this.rtcSignaller.sendRtcAnswer(routerId, connection.getPeerId(), connection.getConnectionId(), description)
                this.attemptProtocolVersionValidation(connection)
            })
        }

        connection.on('localCandidate', (candidate, mid) => {
            this.rtcSignaller.sendRtcIceCandidate(routerId, connection.getPeerId(), connection.getConnectionId(), candidate, mid)
        })
        connection.once('open', () => {
            this.emit(Event.PEER_CONNECTED, connection.getPeerInfo())
        })
        connection.on('message', (message) => {
            this.emit(Event.MESSAGE_RECEIVED, connection.getPeerInfo(), message)
            this.metrics.receiveMessagesPerSecond.record(1)
            this.metrics.receiveBytesPerSecond.record(message.length)
        })
        connection.once('close', () => {
            if (this.connections[targetPeerId] === connection) {
                // if endpoint.close() was called, connection has already been
                // removed and possibly replaced. This check avoids deleting new
                // connection.
                delete this.connections[targetPeerId]
                this.onConnectionCountChange()
            }
            this.negotiatedProtocolVersions.removeNegotiatedProtocolVersion(targetPeerId)
            this.emit(Event.PEER_DISCONNECTED, connection.getPeerInfo())
            connection.removeAllListeners()
        })
        connection.on('bufferLow', () => {
            this.emit(Event.LOW_BACK_PRESSURE, connection.getPeerInfo())
        })
        connection.on('bufferHigh', () => {
            this.emit(Event.HIGH_BACK_PRESSURE, connection.getPeerInfo())
        })
        connection.on('failed', () => {
            this.metrics.connectionTotalFailureCount.record(1)
        })

        return connection
    }

    private onRtcOfferFromSignaller({ routerId, originatorInfo, description, connectionId }: OfferOptions): void {
        const { peerId } = originatorInfo

        let connection: WebRtcConnection

        if (!this.connections[peerId]) {
            connection = this.createConnection(peerId, routerId, null)

            try {
                connection.connect()
            } catch (e) {
                logger.warn('Failed to connect (onRtcOfferFromSignaller)', e)
            }
            this.connections[peerId] = connection
            this.onConnectionCountChange()
        } else if (this.connections[peerId].getConnectionId() !== 'none') {
            connection = this.replaceConnection(peerId, routerId)

        } else {
            connection = this.connections[peerId]
        }
        connection.setPeerInfo(PeerInfo.fromObject(originatorInfo))
        connection.setConnectionId(connectionId)
        connection.setRemoteDescription(description, 'offer')
    }

    private onRtcAnswerFromSignaller({ originatorInfo, description, connectionId }: AnswerOptions): void {
        const { peerId } = originatorInfo
        const connection = this.connections[peerId]
        if (!connection) {
            logger.debug('Received unexpected rtcAnswer', { peerId, description })
        } else if (connection.getConnectionId() !== connectionId) {
            logger.debug('Received unexpected rtcAnswer (connectionId mismatch)', {
                peerId,
                currentConnectionId: connection.getConnectionId(),
                sentConnectionId: connectionId
            })
        } else {
            connection.setPeerInfo(PeerInfo.fromObject(originatorInfo))
            connection.setRemoteDescription(description, 'answer')
            this.attemptProtocolVersionValidation(connection)
        }
    }

    isIceCandidateAllowed(candidate: string): boolean {
        if (this.disallowPrivateAddresses) {
            const address = getAddressFromIceCandidate(candidate)
            if (address && isPrivateIPv4(address)) {
                return false
            }
        }
        return true
    }

    private onIceCandidateFromSignaller({ originatorInfo, candidate, mid, connectionId }: IceCandidateOptions): void {
        const { peerId } = originatorInfo
        const connection = this.connections[peerId]
        if (!connection) {
            logger.debug('Received unexpected iceCandidate (no connection)', { peerId, candidate })
        } else if (connection.getConnectionId() !== connectionId) {
            logger.debug('Received unexpected iceCandidate (connectionId mismatch)', {
                peerId,
                currentConnectionId: connection.getConnectionId(),
                sentConnectionId: connectionId
            })
        } else {
            if (this.isIceCandidateAllowed(candidate)) {
                connection.addRemoteCandidate(candidate, mid)
            }
        }
    }

    private onErrorFromSignaller({ targetNode, errorCode }: ErrorOptions): void {
        const error = new WebRtcError(`RTC error ${errorCode} while attempting to signal with node ${targetNode}`)
        const connection = this.connections[targetNode]
        // treat rtcSignaller errors as connection errors.
        if (connection) {
            connection.close(error)
        }
    }

    private onConnectFromSignaller({ originatorInfo, routerId }: ConnectOptions): void {
        const { peerId } = originatorInfo
        if (this.connections[peerId]) {
            this.replaceConnection(peerId, routerId, uuidv4())
        } else {
            this.connect(peerId, routerId, true).then(() => {
                logger.trace('Failed to connect (unattended connectListener induced connection)', { peerId })
                return peerId
            }).catch((err) => {
                logger.trace('Failed to connect (connectListener induced connection)', { peerId, err })
            })
        }
    }

    private replaceConnection(peerId: PeerId, routerId: string, newConnectionId?: string): WebRtcConnection {
        // Close old connection
        const conn = this.connections[peerId]
        let deferredConnectionAttempt = null
        if (conn.getDeferredConnectionAttempt()) {
            deferredConnectionAttempt = conn.stealDeferredConnectionAttempt()
        }
        delete this.connections[peerId]
        this.onConnectionCountChange()
        conn.close()

        // Set up new connection
        const connection = this.createConnection(peerId, routerId, deferredConnectionAttempt)
        if (newConnectionId) {
            connection.setConnectionId(newConnectionId)
        }
        try {
            connection.connect()
        } catch (e) {
            logger.warn('Failed to connect (replaceConnection)', e)
        }
        this.connections[peerId] = connection
        this.onConnectionCountChange()
        return connection
    }

    async connect(
        targetPeerId: PeerId,
        routerId: string,
        trackerInstructed = true
    ): Promise<PeerId> {
        // Prevent new connections from being opened when WebRtcEndpoint has been closed
        if (this.stopped) {
            return Promise.reject(new WebRtcError('WebRtcEndpoint has been stopped'))
        }

        if (this.connections[targetPeerId]) {
            const connection = this.connections[targetPeerId]
            const lastState = connection.getLastState()
            const deferredConnectionAttempt = connection.getDeferredConnectionAttempt()

            logger.trace('Found pre-existing connection for peer', {
                role: isOffering(this.peerInfo.peerId, targetPeerId) ? 'offerer' : 'answerer',
                targetPeerId: NameDirectory.getName(targetPeerId),
                state: lastState
            })

            if (lastState === 'connected') {
                return Promise.resolve(targetPeerId)
            } else if (deferredConnectionAttempt) {
                return deferredConnectionAttempt.getPromise()
            } else {
                throw new Error(`unexpected deferedConnectionAttempt == null ${connection.getPeerId()}`)
            }
        }

        const connection = this.createConnection(targetPeerId, routerId, null)

        if (connection.isOffering()) {
            connection.setConnectionId(uuidv4())
        }

        this.connections[targetPeerId] = connection
        this.onConnectionCountChange()
        connection.connect()

        if (!trackerInstructed && !connection.isOffering()) {
            // If we are non-offerer and this connection was not instructed by the tracker, we need
            // to let the offering side know about it so it can send us the initial offer message.

            this.rtcSignaller.sendRtcConnect(routerId, connection.getPeerId())
        }

        const deferredAttempt = connection.getDeferredConnectionAttempt()

        if (connection.getLastState() == 'connected') {
            return targetPeerId
        }
        if (deferredAttempt) {
            return deferredAttempt.getPromise()
        } else {
            throw new WebRtcError(`disconnected ${connection.getPeerId()}`)
        }
    }

    async send(targetPeerId: PeerId, message: string): Promise<void> {
        if (!this.connections[targetPeerId]) {
            throw new WebRtcError(`Not connected to ${targetPeerId}.`)
        }

        await this.connections[targetPeerId].send(message)

        this.metrics.sendMessagesPerSecond.record(1)
        this.metrics.sendBytesPerSecond.record(message.length)
    }

    private attemptProtocolVersionValidation(connection: WebRtcConnection): void {
        try {
            this.negotiatedProtocolVersions.negotiateProtocolVersion(
                connection.getPeerId(),
                connection.getPeerInfo().controlLayerVersions,
                connection.getPeerInfo().messageLayerVersions
            )
        } catch (err) {
            logger.debug('Encountered error while negotiating protocol versions', err)
            this.close(connection.getPeerId(), `No shared protocol versions with node: ${connection.getPeerId()}`)
        }
    }

    close(receiverPeerId: PeerId, reason: string): void {
        const connection = this.connections[receiverPeerId]
        if (connection) {
            logger.debug('Close connection', { peerId: NameDirectory.getName(receiverPeerId), reason })
            delete this.connections[receiverPeerId]
            this.onConnectionCountChange()
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

    getPeerInfo(): Readonly<PeerInfo> {
        return this.peerInfo
    }

    getNegotiatedMessageLayerProtocolVersionOnNode(peerId: PeerId): number | undefined {
        return this.negotiatedProtocolVersions.getNegotiatedProtocolVersions(peerId)?.messageLayerVersion
    }

    getNegotiatedControlLayerProtocolVersionOnNode(peerId: PeerId): number | undefined {
        return this.negotiatedProtocolVersions.getNegotiatedProtocolVersions(peerId)?.controlLayerVersion
    }

    getDefaultMessageLayerProtocolVersion(): number {
        return this.negotiatedProtocolVersions.getDefaultProtocolVersions().messageLayerVersion
    }

    getDefaultControlLayerProtocolVersion(): number {
        return this.negotiatedProtocolVersions.getDefaultProtocolVersions().controlLayerVersion
    }

    /**
     * @deprecated
     */
    getAddress(): string {
        return this.peerInfo.peerId
    }

    stop(): void {
        if (this.stopped === true) {
            throw new Error('already stopped')
        }
        this.stopped = true
        const { connections, messageQueues } = this
        this.connections = {}
        this.onConnectionCountChange()
        this.messageQueues = {}
        this.rtcSignaller.setOfferListener(() => {})
        this.rtcSignaller.setAnswerListener(() => {})
        this.rtcSignaller.setIceCandidateListener(() => {})
        this.rtcSignaller.setErrorListener(() => {})
        this.rtcSignaller.setConnectListener(() => {})
        clearInterval(this.statusReportTimer!)
        this.removeAllListeners()
        Object.values(connections).forEach((connection) => connection.close())
        Object.values(messageQueues).forEach((queue) => queue.clear())
        this.connectionFactory.unregisterWebRtcEndpoint()
    }

    getAllConnectionNodeIds(): PeerId[] {
        return Object.keys(this.connections)
    }

    getDiagnosticInfo(): Record<string, unknown> {
        return {
            connections: Object.values(this.connections).map((c) => c.getDiagnosticInfo())
        }
    }

    private onConnectionCountChange() {
        this.metrics.connectionAverageCount.record(Object.keys(this.connections).length)
    }
}
