// TODO: rename to UpdateIpRequest?
export interface UpdateIpAndPortRequest {
    token: string
    sessionId: string
    nodeId: string
    streamrWebSocketPort: number
}
