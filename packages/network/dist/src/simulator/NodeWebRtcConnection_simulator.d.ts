import { ConstructorOptions, WebRtcConnection } from '../connection/webrtc/WebRtcConnection';
import { DescriptionType } from 'node-datachannel';
export declare const webRtcConnectionFactory: {
    createConnection(opts: ConstructorOptions): WebRtcConnection;
    registerWebRtcEndpoint(): void;
    unregisterWebRtcEndpoint(): void;
};
export declare class NodeWebRtcConnection extends WebRtcConnection {
    private readonly logger;
    private lastState?;
    private lastGatheringState?;
    private open;
    private remoteDescriptionSet;
    constructor(opts: ConstructorOptions);
    protected doSendMessage(message: string): void;
    protected doConnect(): void;
    setRemoteDescription(_udescription: string, _utype: DescriptionType): void;
    addRemoteCandidate(_ucandidate: string, _umid: string): void;
    protected doClose(_err?: Error): void;
    getBufferedAmount(): number;
    getMaxMessageSize(): number;
    isOpen(): boolean;
    getLastState(): string | undefined;
    getLastGatheringState(): string | undefined;
    handleIncomingMessage(message: string): void;
    handleIncomingDisconnection(): void;
    handleIncomingConnection(): void;
}
