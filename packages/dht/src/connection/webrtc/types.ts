export interface IceServer {
    url: string
    port: number
    username?: string
    password?: string
    tcp?: boolean
}

/**
 * The second, partially reliable data channel for live media. Both ends must
 * have it enabled: a peer advertises the capability in the handshake only
 * when enabled, and the offerer creates the channel only towards peers that
 * advertised it. Everything else keeps flowing on the reliable channel.
 */
export interface WebrtcMediaChannelOptions {
    /** default true */
    enabled?: boolean
    /** PR-SCTP lifetime of a media message in ms, default 1500 */
    maxPacketLifeTimeMs?: number
    /** backpressure watermarks of the media channel's send queue (bytes) */
    bufferThresholdHigh?: number
    bufferThresholdLow?: number
}
