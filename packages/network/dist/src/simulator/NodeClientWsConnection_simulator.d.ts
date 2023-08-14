import { ReadyState, AbstractWsConnection } from '../connection/ws/AbstractWsConnection';
import NodeClientWsEndpoint from './NodeClientWsEndpoint_simulator';
import { PeerInfo } from '../connection/PeerInfo';
import { DisconnectionCode, DisconnectionReason } from '../connection/ws/AbstractWsEndpoint';
export declare class NodeClientWsConnection extends AbstractWsConnection {
    private readyState;
    private ownAddress;
    private ownPeerInfo;
    private remoteAddress;
    private endpoint;
    constructor(ownAddress: string, ownPeerInfo: PeerInfo, remoteAddress: string, remotePeerInfo: PeerInfo, endpoint: NodeClientWsEndpoint);
    close(code: DisconnectionCode, reason: DisconnectionReason): void;
    terminate(): void;
    getBufferedAmount(): number;
    getReadyState(): ReadyState;
    sendPing(): void;
    send(message: string): Promise<void>;
}
