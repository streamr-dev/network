/// <reference types="node" />
import { ReadyState, AbstractWsConnection } from './AbstractWsConnection';
import { PeerInfo } from '../PeerInfo';
import { DisconnectionCode, DisconnectionReason } from './AbstractWsEndpoint';
import { Logger } from "@streamr/utils";
import WebSocket from 'ws';
import stream from 'stream';
export declare const logger: Logger;
export declare class ServerWsConnection extends AbstractWsConnection {
    private readonly socket;
    private readonly duplexStream;
    private readonly remoteAddress;
    constructor(socket: WebSocket, duplexStream: stream.Duplex, remoteAddress: string | undefined, peerInfo: PeerInfo);
    close(code: DisconnectionCode, reason: DisconnectionReason): void;
    terminate(): void;
    getBufferedAmount(): number;
    getReadyState(): ReadyState;
    sendPing(): void;
    send(message: string): Promise<void>;
    getRemoteAddress(): string | undefined;
}
