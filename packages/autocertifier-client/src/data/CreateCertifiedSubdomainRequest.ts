export interface CreateCertifiedSubdomainRequest {
    streamrWebSocketPort: number
    sessionId: string
    peerId: string
    streamrWebSocketCaCert?: string
}
