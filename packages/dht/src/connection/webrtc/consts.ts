export const EARLY_TIMEOUT = 5000

// RTCDataChannel backpressure watermarks (bytes): sends above HIGH are held in
// the JS-side queue, which drains once the channel reports bufferedamountlow
// (set at LOW). See DataChannelSendQueue.
export const DEFAULT_BUFFER_THRESHOLD_HIGH = 2 ** 17
export const DEFAULT_BUFFER_THRESHOLD_LOW = 2 ** 15

// Data channel labels. The reliable channel carries everything (RPC, control,
// and media towards peers without the media channel); the media channel is an
// ordered, partially reliable channel for live media (see DataChannelSet).
export const RELIABLE_CHANNEL_LABEL = 'streamrDataChannel'
export const MEDIA_CHANNEL_LABEL = 'streamrMediaChannel'
// advertised in the handshake by peers that can accept the media channel
export const MEDIA_CHANNEL_CAPABILITY = 'webrtc-media-channel/1'
// a media message not delivered within this time is abandoned (PR-SCTP)
export const DEFAULT_MEDIA_CHANNEL_MAX_PACKET_LIFE_TIME_MS = 1500
// smaller watermarks on the media channel: a message waits in the SCTP buffer
// at most watermark/linkRate before its lifetime runs out
export const DEFAULT_MEDIA_BUFFER_THRESHOLD_HIGH = 2 ** 16
export const DEFAULT_MEDIA_BUFFER_THRESHOLD_LOW = 2 ** 14
