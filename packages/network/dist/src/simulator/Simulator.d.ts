import { ServerWsEndpoint } from './ServerWsEndpoint_simulator';
import NodeClientWsEndpoint from './NodeClientWsEndpoint_simulator';
import { PeerInfo } from '../connection/PeerInfo';
import { DisconnectionReason, DisconnectionCode } from '../connection/ws/AbstractWsEndpoint';
import { IWsSimulator } from './IWsSimulator';
import { NodeWebRtcConnection } from './NodeWebRtcConnection_simulator';
export declare class SimulatedNode {
    wsServerEndpoint: ServerWsEndpoint | null;
    wsClientEndpoint: NodeClientWsEndpoint | null;
    constructor(wsServerEndpoint: ServerWsEndpoint | null, wsClientEndpoint: NodeClientWsEndpoint | null);
}
export declare function cleanAddress(addr: string): string;
export declare class Simulator implements IWsSimulator {
    private static singleton;
    private nodes;
    private wsEndpoints;
    private webRtcConnections;
    private constructor();
    static instance(): Simulator;
    addServerWsEndpoint(peerInfo: PeerInfo, host: string, port: number, endpoint: ServerWsEndpoint): void;
    addClientWsEndpoint(peerInfo: PeerInfo, ownAddress: string, endpoint: NodeClientWsEndpoint): void;
    wsDisconnect(fromAddress: string, fromInfo: PeerInfo, toAddress: string, code: DisconnectionCode, reason: DisconnectionReason | string): Promise<void>;
    wsSend(fromAddress: string, fromInfo: PeerInfo, toAddress: string, message: string): Promise<void>;
    wsConnect(fromAddress: string, fromInfo: PeerInfo, toAddress: string): Promise<void>;
    addWebRtcConnection(fromId: string, toId: string, connection: NodeWebRtcConnection): void;
    webRtcSend(fromId: string, toId: string, message: string): void;
    webRtcDisconnect(fromId: string, toId: string): void;
    webRtcConnect(fromId: string, toId: string): void;
}
