/// <reference types="node" />
/// <reference types="node" />
/// <reference types="node" />
import { PeerId, PeerInfo } from '../PeerInfo';
import { AbstractWsEndpoint, DisconnectionCode, DisconnectionReason } from "./AbstractWsEndpoint";
import { ServerWsConnection } from './ServerWsConnection';
import https from 'https';
import http from 'http';
import WebSocket from 'ws';
import { Duplex } from "stream";
interface HostPort {
    hostname: string;
    port: number;
}
type UnixSocket = string;
export type HttpServerConfig = HostPort | UnixSocket;
export declare class ServerWsEndpoint extends AbstractWsEndpoint<ServerWsConnection> {
    private readonly serverUrl;
    private readonly httpServer;
    private readonly wss;
    constructor(listen: HttpServerConfig, sslEnabled: boolean, httpServer: http.Server | https.Server, peerInfo: PeerInfo, pingInterval: number);
    private startWsServer;
    acceptConnection(ws: WebSocket, duplexStream: Duplex, peerId: PeerId, remoteAddress: string): void;
    getUrl(): string;
    resolveAddress(peerId: PeerId): string | undefined;
    protected doClose(_connection: ServerWsConnection, _code: DisconnectionCode, _reason: DisconnectionReason): void;
    protected doStop(): Promise<void>;
    private resolveIP;
}
export declare function startHttpServer(config: HttpServerConfig, privateKeyFileName?: string | undefined, certFileName?: string | undefined): Promise<http.Server | https.Server>;
export {};
