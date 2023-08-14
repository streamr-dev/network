/// <reference types="node" />
/// <reference types="node" />
import { PeerId, PeerInfo } from '../connection/PeerInfo';
import { AbstractWsEndpoint, DisconnectionCode, DisconnectionReason } from "../connection/ws/AbstractWsEndpoint";
import { ServerWsConnection } from './ServerWsConnection_simulator';
import https from 'https';
import http from 'http';
import { ISimulatedWsEndpoint } from './ISimulatedWsEndpoint';
interface HostPort {
    hostname: string;
    port: number;
}
type UnixSocket = string;
export type HttpServerConfig = HostPort | UnixSocket;
export declare class ServerWsEndpoint extends AbstractWsEndpoint<ServerWsConnection> implements ISimulatedWsEndpoint {
    private readonly serverUrl;
    private readonly httpServer;
    private readonly ownAddress;
    private handshakeListeners;
    constructor(listen: HttpServerConfig, sslEnabled: boolean, httpServer: http.Server | https.Server | null, peerInfo: PeerInfo, pingInterval: number);
    /****************** Called by Simulator ************/
    handleIncomingConnection(fromAddress: string, _ufromInfo: PeerInfo): void;
    handleIncomingDisconnection(_fromAddress: string, fromInfo: PeerInfo, code: DisconnectionCode, reason: DisconnectionReason | string): void;
    handleIncomingMessage(fromAddress: string, fromInfo: PeerInfo, data: string): Promise<void>;
    /****************** Called by Simulator ends *******/
    private acceptConnection;
    getUrl(): string;
    resolveAddress(peerId: PeerId): string | undefined;
    protected doClose(_connection: ServerWsConnection, _code: DisconnectionCode, _reason: DisconnectionReason): void;
    protected doStop(): Promise<void>;
}
export declare function startHttpServer(config: HttpServerConfig, privateKeyFileName?: string | undefined, certFileName?: string | undefined): Promise<http.Server | https.Server | null>;
export {};
