import { DescriptionType } from 'node-datachannel';
import { ConstructorOptions, WebRtcConnection } from './WebRtcConnection';
import { Logger } from "@streamr/utils";
export declare const webRtcConnectionFactory: {
    activeWebRtcEndpointCount: number;
    logger: Logger;
    createConnection(opts: ConstructorOptions): WebRtcConnection;
    registerWebRtcEndpoint(): void;
    unregisterWebRtcEndpoint(): void;
};
export declare class NodeWebRtcConnection extends WebRtcConnection {
    private readonly logger;
    private connection;
    private dataChannel;
    private dataChannelEmitter?;
    private connectionEmitter?;
    private lastState?;
    private lastGatheringState?;
    private remoteDescriptionSet;
    constructor(opts: ConstructorOptions);
    protected doSendMessage(message: string): void;
    protected doConnect(): void;
    setRemoteDescription(description: string, type: DescriptionType): void;
    addRemoteCandidate(candidate: string, mid: string): void;
    protected doClose(_err?: Error): void;
    getBufferedAmount(): number;
    getMaxMessageSize(): number;
    isOpen(): boolean;
    getLastState(): string | undefined;
    getLastGatheringState(): string | undefined;
    private onStateChange;
    private onGatheringStateChange;
    private onDataChannel;
    private onLocalDescription;
    private onLocalCandidate;
    private setupDataChannel;
    private openDataChannel;
}
