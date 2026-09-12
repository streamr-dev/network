export const EARLY_TIMEOUT = 5000

// RTCDataChannel backpressure watermarks (bytes): sends above HIGH are held in
// the JS-side queue, which drains once the channel reports bufferedamountlow
// (set at LOW). See DataChannelSendQueue.
export const DEFAULT_BUFFER_THRESHOLD_HIGH = 2 ** 17
export const DEFAULT_BUFFER_THRESHOLD_LOW = 2 ** 15
