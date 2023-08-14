import { PeerId, PeerInfo } from '../connection/PeerInfo';
import { AbstractWsEndpoint, DisconnectionCode, DisconnectionReason } from '../connection/ws/AbstractWsEndpoint';
import { AbstractWsConnection } from '../connection/ws/AbstractWsConnection';
import WebSocket from 'ws';
export type ServerUrl = string;
export interface HandshakeValues {
    uuid: string;
    peerId: PeerId;
}
export declare abstract class AbstractClientWsEndpoint<C extends AbstractWsConnection> extends AbstractWsEndpoint<C> {
    protected readonly connectionsByServerUrl: Map<ServerUrl, C>;
    protected readonly serverUrlByPeerId: Map<PeerId, ServerUrl>;
    protected readonly pendingConnections: Map<ServerUrl, Promise<PeerId>>;
    protected ownAddress: string;
    constructor(peerInfo: PeerInfo, pingInterval: number);
    getServerUrlByPeerId(peerId: PeerId): string | undefined;
    protected doClose(connection: C, _code: DisconnectionCode, _reason: DisconnectionReason): void;
    protected doStop(): Promise<void>;
    connect(serverUrl: ServerUrl, serverPeerInfo: PeerInfo): Promise<PeerId>;
    /**
     * Custom connect logic of subclass
     */
    protected abstract doConnect(serverUrl: ServerUrl, serverPeerInfo: PeerInfo): Promise<PeerId>;
    /**
     * Init client-side handshake timeout
     */
    protected handshakeInit(serverAddress: string, serverPeerInfo: PeerInfo, reject: (reason?: any) => void): void;
    /**
     * Initial handshake message listener
     */
    protected handshakeListener(serverPeerInfo: PeerInfo, serverUrl: string, message: WebSocket.RawData, resolve: (value: PeerId | PromiseLike<string>) => void): void;
    protected onHandshakeError(serverUrl: string, error: Error, reject: (reason?: any) => void): void;
    protected onHandshakeClosed(serverUrl: string, code: number, reason: string, reject: (reason?: any) => void): void;
    protected ongoingConnectionError(serverPeerId: PeerId, error: Error, connection: AbstractWsConnection): void;
    /**
     * Send a handshake response back to the server
     */
    protected abstract doHandshakeResponse(uuid: string, peerId: PeerId, serverAddress: string): void;
    /**
     * Parse handshake message
     */
    protected abstract doHandshakeParse(message: WebSocket.RawData): HandshakeValues;
    /**
     * Finalise WS connection e.g. add final event listeners
     */
    protected abstract doSetUpConnection(serverPeerInfo: PeerInfo, serverAddress: string): C;
    private setUpConnection;
}
