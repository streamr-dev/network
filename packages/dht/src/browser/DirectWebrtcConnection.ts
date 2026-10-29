import { EventEmitter } from 'eventemitter3'
import { WebrtcConnectionEvents, IWebrtcConnection, RtcDescription } from '../connection/webrtc/IWebrtcConnection'
import { IConnection, ConnectionID, ConnectionType } from '../connection/IConnection'
import { Logger } from '@streamr/utils'
import { IceServer, WebrtcMediaChannelOptions } from '../connection/webrtc/types'
import {
    DEFAULT_BUFFER_THRESHOLD_HIGH,
    DEFAULT_BUFFER_THRESHOLD_LOW,
    DEFAULT_MEDIA_BUFFER_THRESHOLD_HIGH,
    DEFAULT_MEDIA_BUFFER_THRESHOLD_LOW,
    DEFAULT_MEDIA_CHANNEL_MAX_PACKET_LIFE_TIME_MS,
    EARLY_TIMEOUT,
    MEDIA_CHANNEL_CAPABILITY,
    MEDIA_CHANNEL_LABEL,
    RELIABLE_CHANNEL_LABEL
} from '../connection/webrtc/consts'
import { createRandomConnectionId } from '../connection/Connection'
import type { WebrtcConnectionParams } from '../types/WebrtcConnectionParams'
import { logGapDiagnosticSampled } from '../GapDiagnostics'
import { DataChannelSet } from '../connection/webrtc/DataChannelSet'
import { SendQueueStatistics, SendQueueHint } from '../connection/ConnectionStatistics'
import { ConnectionInfo } from '../connection/ConnectionDiagnostics'
import { getRtcConnectionInfo } from './rtcConnectionInfo'

enum DisconnectedRtcPeerConnectionStateEnum {
    DISCONNECTED = 'disconnected',
    FAILED = 'failed',
    CLOSED = 'closed',
}

const logger = new Logger('DirectWebrtcConnection (browser)')

/**
 * Browser RTCPeerConnection owned on the calling thread (no worker).
 *
 * Two data channels: the reliable `streamrDataChannel` (created by the offerer
 * before the offer; its open = the connection is open, its close = the
 * connection is closed) and, towards peers that advertised the capability in
 * the handshake, the ordered-but-partially-reliable `streamrMediaChannel`,
 * created in-band by the offerer once the handshake completes. Messages
 * hinted `channel: 'media'` go on the media channel while it is open and on
 * the reliable one otherwise (see DataChannelSet).
 */
export class DirectWebrtcConnection extends EventEmitter<WebrtcConnectionEvents> implements IWebrtcConnection, IConnection {

    public connectionId: ConnectionID
    public readonly connectionType: ConnectionType = ConnectionType.WEBRTC
    // We need to keep track of connection state ourselves because
    // RTCPeerConnection.connectionState is not supported on Firefox
    private lastState: RTCPeerConnectionState = 'connecting'
    private readonly iceServers: IceServer[]
    private peerConnection?: RTCPeerConnection
    private readonly bufferThresholdLow: number
    private readonly mediaChannelOptions: Required<WebrtcMediaChannelOptions>
    private reliableChannel?: RTCDataChannel
    private mediaChannel?: RTCDataChannel
    private mediaChannelClosed = false
    private remoteCapabilities: string[] = []
    private makingOffer = false
    private isOffering = false
    private closed = false
    private earlyTimeout: NodeJS.Timeout
    private readonly channels: DataChannelSet
    private readonly constructedAt = Date.now()

    constructor(params: WebrtcConnectionParams) {
        super()
        this.connectionId = createRandomConnectionId()
        this.iceServers = params.iceServers ?? []
        const bufferThresholdHigh = params.bufferThresholdHigh ?? DEFAULT_BUFFER_THRESHOLD_HIGH
        this.bufferThresholdLow = params.bufferThresholdLow ?? DEFAULT_BUFFER_THRESHOLD_LOW
        this.mediaChannelOptions = {
            enabled: params.mediaChannel?.enabled ?? true,
            maxPacketLifeTimeMs: params.mediaChannel?.maxPacketLifeTimeMs ?? DEFAULT_MEDIA_CHANNEL_MAX_PACKET_LIFE_TIME_MS,
            bufferThresholdHigh: params.mediaChannel?.bufferThresholdHigh ?? DEFAULT_MEDIA_BUFFER_THRESHOLD_HIGH,
            bufferThresholdLow: params.mediaChannel?.bufferThresholdLow ?? DEFAULT_MEDIA_BUFFER_THRESHOLD_LOW
        }
        this.channels = new DataChannelSet({
            reliable: {
                bufferedAmount: () => this.reliableChannel?.bufferedAmount ?? 0,
                send: (data: Uint8Array) => this.reliableChannel?.send(data as ArrayBufferView<ArrayBuffer>)
            },
            media: {
                bufferedAmount: () => this.mediaChannel?.bufferedAmount ?? 0,
                send: (data: Uint8Array) => this.mediaChannel?.send(data as ArrayBufferView<ArrayBuffer>)
            }
        }, {
            bufferThresholdHigh,
            mediaBufferThresholdHigh: this.mediaChannelOptions.bufferThresholdHigh
        })
        this.earlyTimeout = setTimeout(() => {
            this.doClose(false, 'timed out due to remote descriptor not being set')
        }, EARLY_TIMEOUT)
    }

    public start(isOffering: boolean): void {
        this.isOffering = isOffering
        const urls: RTCIceServer[] = this.iceServers.map(({ url, port, username, password, tcp }) => ({
            urls: `${url}:${port}${tcp ? '?transport=tcp' : ''}`,
            username,
            credential: password
        }))
        this.peerConnection = new RTCPeerConnection({ iceServers: urls })

        this.peerConnection.onicecandidate = (event) => {

            if ((event.candidate !== null) && (event.candidate.sdpMid !== null)) {
                this.emit('localCandidate', event.candidate.candidate, event.candidate.sdpMid)
            }
        }

        this.peerConnection.onicegatheringstatechange = () => {
            logger.trace(`conn.onGatheringStateChange: ${this.peerConnection?.iceGatheringState}`)
        }

        this.peerConnection.onconnectionstatechange = () => this.onStateChange()

        if (isOffering) {
            this.peerConnection.onnegotiationneeded = async () => {
                if (this.peerConnection !== undefined) {
                    this.makingOffer = true
                    try {
                        await this.peerConnection.setLocalDescription()
                    } catch (err) {
                        logger.warn('Failed to set local description', { err })
                    }
                    if (this.peerConnection.localDescription !== null) {
                        this.emit('localDescription', this.peerConnection.localDescription?.sdp, this.peerConnection.localDescription?.type)
                    }
                }
                this.makingOffer = false
            }

            const dataChannel = this.peerConnection.createDataChannel(RELIABLE_CHANNEL_LABEL)
            this.setupReliableChannel(dataChannel)
        } else {
            this.peerConnection.ondatachannel = (event) => {
                this.onIncomingDataChannel(event.channel)
            }
        }
    }

    public async setRemoteDescription(description: string, type: string): Promise<void> {
        const offerCollision = (type.toLowerCase() === RtcDescription.OFFER) && (this.makingOffer || this.peerConnection?.signalingState != 'stable')

        const ignoreOffer = this.isOffering && offerCollision
        if (ignoreOffer) {
            return
        }
        try {
            await this.peerConnection?.setRemoteDescription({ sdp: description, type: type.toLowerCase() as RTCSdpType })
            clearTimeout(this.earlyTimeout)
        } catch (err) {
            logger.warn('Failed to set remote description', { err })
        }

        if ((type.toLowerCase() === RtcDescription.OFFER) && (this.peerConnection !== undefined)) {
            try {
                await this.peerConnection.setLocalDescription()
            } catch (err) {
                logger.warn('Failed to set local description', { err })
            }
            if (this.peerConnection.localDescription !== null) {
                this.emit('localDescription', this.peerConnection.localDescription.sdp, this.peerConnection.localDescription.type)
            }
        }
    }

    public addRemoteCandidate(candidate: string, mid: string): void {
        this.peerConnection?.addIceCandidate({ candidate: candidate, sdpMid: mid })
            .catch((err) => {
                logger.warn('Failed to add ICE candidate', { err })
            })
    }

    public isOpen(): boolean {
        return this.lastState === 'connected'
    }

    // IConnection implementation

    public async close(gracefulLeave: boolean, reason?: string): Promise<void> {
        this.doClose(gracefulLeave, reason)
    }

    private doClose(gracefulLeave: boolean, reason?: string): void {
        if (!this.closed) {
            this.closed = true
            this.lastState = 'closed'
            this.channels.clear()
            clearTimeout(this.earlyTimeout)

            this.stopListening()
            this.emit('disconnected', gracefulLeave, undefined, reason)

            this.removeAllListeners()

            for (const channel of [this.mediaChannel, this.reliableChannel]) {
                if (channel !== undefined) {
                    try {
                        channel.close()
                    } catch (err) {
                        logger.warn('Failed to close data channel', { err })
                    }
                }
            }
            this.reliableChannel = undefined
            this.mediaChannel = undefined

            if (this.peerConnection !== undefined) {
                try {
                    this.peerConnection.close()
                } catch (err) {
                    logger.warn('Failed to close connection', { err })
                }
            }
            this.peerConnection = undefined

        }
    }

    public destroy(): void {
        this.removeAllListeners()
        this.doClose(false)
    }

    public purgeSendQueue(purgeKey: string): number {
        return this.channels.purge(purgeKey)
    }

    public send(data: Uint8Array, hint?: SendQueueHint): void {
        if (this.lastState === 'connected') {
            this.channels.send(data, hint)
        } else {
            logger.warn('Tried to send on a connection with last state ' + this.lastState)
        }
    }

    // ── capabilities / media channel ──────────────────────────────────

    public getLocalCapabilities(): string[] {
        return this.mediaChannelOptions.enabled ? [MEDIA_CHANNEL_CAPABILITY] : []
    }

    public setRemoteCapabilities(capabilities: string[]): void {
        this.remoteCapabilities = capabilities
        if (
            this.isOffering
            && this.mediaChannelOptions.enabled
            && capabilities.includes(MEDIA_CHANNEL_CAPABILITY)
            && !this.closed
            && this.mediaChannel === undefined
            && this.peerConnection !== undefined
        ) {
            this.createMediaChannel()
        }
    }

    private createMediaChannel(): void {
        try {
            const channel = this.peerConnection!.createDataChannel(MEDIA_CHANNEL_LABEL, {
                ordered: true,
                maxPacketLifeTime: this.mediaChannelOptions.maxPacketLifeTimeMs
            })
            this.setupMediaChannel(channel)
        } catch (err) {
            logger.warn('Failed to create the media channel, media stays on the reliable channel', { err })
        }
    }

    private onIncomingDataChannel(channel: RTCDataChannel): void {
        if (channel.label === RELIABLE_CHANNEL_LABEL) {
            this.setupReliableChannel(channel)
        } else if (channel.label === MEDIA_CHANNEL_LABEL) {
            if (!this.mediaChannelOptions.enabled || this.mediaChannel !== undefined) {
                logger.warn(`unexpected media channel from peer (enabled=${this.mediaChannelOptions.enabled}), closing it`)
                try {
                    channel.close()
                } catch {
                    // ignore
                }
                return
            }
            this.setupMediaChannel(channel)
        } else {
            logger.warn(`unknown data channel label "${channel.label}", closing it`)
            try {
                channel.close()
            } catch {
                // ignore
            }
        }
    }

    private setupReliableChannel(dataChannel: RTCDataChannel): void {
        this.reliableChannel = dataChannel
        dataChannel.binaryType = 'arraybuffer'
        dataChannel.bufferedAmountLowThreshold = this.bufferThresholdLow
        dataChannel.onopen = () => {
            logger.trace('dc.onOpen')
            this.onDataChannelOpen()
        }

        dataChannel.onclose = () => {
            logger.trace('dc.onClosed')
            this.doClose(false)
        }

        dataChannel.onerror = (err) => {
            logger.warn('Data channel error', { err })
        }

        dataChannel.onmessage = (msg) => {
            logger.trace('dc.onmessage')
            logGapDiagnosticSampled('dht.dc.onmessage')
            this.emit('data', new Uint8Array(msg.data))
        }
        dataChannel.onbufferedamountlow = () => {
            logger.trace('dc.onBufferedAmountLow')
            this.channels.flush('reliable')
        }
    }

    private setupMediaChannel(dataChannel: RTCDataChannel): void {
        this.mediaChannel = dataChannel
        dataChannel.binaryType = 'arraybuffer'
        dataChannel.bufferedAmountLowThreshold = this.mediaChannelOptions.bufferThresholdLow
        const markOpen = () => {
            logger.trace('media dc.onOpen')
            this.channels.setOpen('media', true)
        }
        dataChannel.onopen = markOpen
        if (dataChannel.readyState === 'open') {
            markOpen()
        }
        dataChannel.onclose = () => {
            logger.debug('media channel closed, media falls back to the reliable channel')
            this.mediaChannelClosed = true
            this.channels.detachMedia()
        }
        dataChannel.onerror = (err) => {
            logger.warn('Media channel error', { err })
        }
        dataChannel.onmessage = (msg) => {
            logGapDiagnosticSampled('dht.dc.onmessage')
            this.emit('data', new Uint8Array(msg.data))
        }
        dataChannel.onbufferedamountlow = () => {
            this.channels.flush('media')
        }
    }

    private stopListening() {
        for (const channel of [this.reliableChannel, this.mediaChannel]) {
            if (channel !== undefined) {
                channel.onopen = null
                channel.onclose = null
                channel.onerror = null
                channel.onbufferedamountlow = null
                channel.onmessage = null
            }
        }

        if (this.peerConnection !== undefined) {
            this.peerConnection.onconnectionstatechange = null
            this.peerConnection.onicecandidate = null
            this.peerConnection.onicegatheringstatechange = null
            this.peerConnection.onnegotiationneeded = null
            this.peerConnection.ondatachannel = null
        }
    }

    private onDataChannelOpen(): void {
        this.lastState = 'connected'
        this.channels.setOpen('reliable', true)
        this.emit('connected')
    }

    private onStateChange(): void {
        if (this.peerConnection!.connectionState === DisconnectedRtcPeerConnectionStateEnum.CLOSED
            || this.peerConnection!.connectionState === DisconnectedRtcPeerConnectionStateEnum.DISCONNECTED
            || this.peerConnection!.connectionState === DisconnectedRtcPeerConnectionStateEnum.FAILED
        ) {
            this.doClose(false)
        }
    }

    public setConnectionId(connectionId: ConnectionID): void {
        this.connectionId = connectionId
    }

    /** Synchronous send-queue snapshot (see IConnection.getStatistics). */
    public getStatistics(): SendQueueStatistics | undefined {
        return this.closed ? undefined : this.channels.getStatistics()
    }

    private mediaChannelState(): ConnectionInfo['mediaChannel'] {
        if (this.mediaChannel === undefined && !this.mediaChannelClosed) {
            return 'none'
        }
        return this.channels.isOpen('media') ? 'open' : 'closed'
    }

    public async getConnectionInfo(): Promise<ConnectionInfo | undefined> {
        const peerConnection = this.peerConnection
        if (peerConnection === undefined || this.closed) {
            return undefined
        }
        const info = await getRtcConnectionInfo(peerConnection)
        if (info !== undefined) {
            info.ms = Date.now() - this.constructedAt
            info.mediaChannel = this.mediaChannelState()
        }
        return info
    }
}
