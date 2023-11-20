export interface CreateCertifiedSubdomainRequest {
    streamrWebSocketPort: number
    sessionId: string
    nodeId: string
    streamrWebSocketCaCert?: string
}
