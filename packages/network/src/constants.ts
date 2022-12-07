import { IceServer } from './connection/webrtc/WebRtcConnection'

export const COUNTER_UNSUBSCRIBE = -1
export const DEFAULT_MAX_NEIGHBOR_COUNT = 4

export const GOOGLE_STUN_SERVER: IceServer = {
    url: 'stun:stun.l.google.com',
    port: 19302
}
