import WebSocket from 'ws';
import { PeerId, PeerInfo } from '../PeerInfo';
import { AbstractWsEndpoint, DisconnectionCode, DisconnectionReason } from "./AbstractWsEndpoint";
import { AbstractWsConnection } from "./AbstractWsConnection";
import { IMessageEvent, w3cwebsocket } from "websocket";
export type ServerUrl = string;
export type SupportedWs = WebSocket | w3cwebsocket;
export interface HandshakeValues {
    uuid: string;
    peerId: PeerId;
}
export interface WebSocketConnectionFactory<C extends AbstractWsConnection> {
    createConnection(socket: SupportedWs, peerInfo: PeerInfo): C;
}
export declare abstract class AbstractClientWsEndpoint<C extends AbstractWsConnection> extends AbstractWsEndpoint<C> {
    protected readonly connectionsByServerUrl: Map<ServerUrl, C>;
    protected readonly serverUrlByPeerId: Map<PeerId, ServerUrl>;
    protected readonly pendingConnections: Map<ServerUrl, Promise<PeerId>>;
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
    protected handshakeInit(ws: SupportedWs, serverPeerInfo: PeerInfo, reject: (reason?: any) => void): void;
    /**
     * Initial handshake message listener
     */
    protected handshakeListener(ws: SupportedWs, serverPeerInfo: PeerInfo, serverUrl: string, message: IMessageEvent | WebSocket.RawData, resolve: (value: PeerId | PromiseLike<string>) => void): void;
    protected onHandshakeError(serverUrl: string, error: Error, reject: (reason?: any) => void): void;
    protected onHandshakeClosed(serverUrl: string, code: number, reason: string, reject: (reason?: any) => void): void;
    protected ongoingConnectionError(serverPeerId: PeerId, error: Error, connection: AbstractWsConnection): void;
    /**
     * Send a handshake response back to the server
     */
    protected abstract doHandshakeResponse(uuid: string, peerId: PeerId, ws: SupportedWs): void;
    /**
     * Parse handshake message
     */
    protected abstract doHandshakeParse(message: IMessageEvent | WebSocket.RawData): HandshakeValues;
    /**
     * Finalise WS connection e.g. add final event listeners
     */
    protected abstract doSetUpConnection(ws: SupportedWs, serverPeerInfo: PeerInfo): C;
    private setUpConnection;
    getDiagnosticInfo(): Record<string, unknown>;
}
