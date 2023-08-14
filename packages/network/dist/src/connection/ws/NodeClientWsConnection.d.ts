import { ReadyState, AbstractWsConnection } from './AbstractWsConnection';
import WebSocket from 'ws';
import { PeerInfo } from '../PeerInfo';
import { DisconnectionCode, DisconnectionReason } from './AbstractWsEndpoint';
import { WebSocketConnectionFactory } from "./AbstractClientWsEndpoint";
export declare const NodeWebSocketConnectionFactory: WebSocketConnectionFactory<NodeClientWsConnection>;
export declare class NodeClientWsConnection extends AbstractWsConnection {
    private readonly socket;
    constructor(socket: WebSocket, peerInfo: PeerInfo);
    close(code: DisconnectionCode, reason: DisconnectionReason): void;
    terminate(): void;
    getBufferedAmount(): number;
    getReadyState(): ReadyState;
    sendPing(): void;
    send(message: string): Promise<void>;
}
