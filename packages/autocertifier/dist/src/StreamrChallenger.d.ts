export declare class StreamrChallenger {
    private readonly SERVICE_ID;
    private readonly protocolVersion;
    private ownPeerDescriptor;
    testStreamrChallenge(streamrWebSocketIp: string, streamrWebSocketPort: string, sessionId: string, _caCert?: string): Promise<void>;
}
