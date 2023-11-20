// TODO: rename to UpdateIpRequest?
export interface UpdateIpAndPortRequest {
    token: string
    sessionId: string
    peerId: string
    streamrWebSocketPort: number
}
