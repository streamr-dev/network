import { ReadyState, AbstractWsConnection } from './AbstractWsConnection';
import { w3cwebsocket } from 'websocket';
import { PeerInfo } from '../PeerInfo';
import { DisconnectionCode, DisconnectionReason } from './AbstractWsEndpoint';
import { WebSocketConnectionFactory } from "./AbstractClientWsEndpoint";
export declare const BrowserWebSocketConnectionFactory: WebSocketConnectionFactory<BrowserClientWsConnection>;
export declare class BrowserClientWsConnection extends AbstractWsConnection {
    private readonly socket;
    constructor(socket: w3cwebsocket, peerInfo: PeerInfo);
    close(code: DisconnectionCode, reason: DisconnectionReason): void;
    terminate(): void;
    getBufferedAmount(): number;
    getReadyState(): ReadyState;
    sendPing(): void;
    send(message: string): Promise<void>;
}
