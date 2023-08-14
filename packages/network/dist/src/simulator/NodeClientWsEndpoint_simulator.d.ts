import { PeerId, PeerInfo } from '../connection/PeerInfo';
import { DisconnectionCode, DisconnectionReason } from '../connection/ws/AbstractWsEndpoint';
import { NodeClientWsConnection } from './NodeClientWsConnection_simulator';
import { AbstractClientWsEndpoint, HandshakeValues, ServerUrl } from './AbstractClientWsEndpoint_simulator';
import { ISimulatedWsEndpoint } from './ISimulatedWsEndpoint';
import WebSocket from 'ws';
export default class NodeClientWsEndpoint extends AbstractClientWsEndpoint<NodeClientWsConnection> implements ISimulatedWsEndpoint {
    private pendingHandshakes;
    constructor(peerInfo: PeerInfo, pingInterval: number);
    protected doConnect(serverUrl: ServerUrl, serverPeerInfo: PeerInfo): Promise<PeerId>;
    doOnClose(connection: NodeClientWsConnection, code: DisconnectionCode, reason: DisconnectionReason | string): void;
    protected doSetUpConnection(serverPeerInfo: PeerInfo, serverAddress: string): NodeClientWsConnection;
    private newConnection;
    protected doHandshakeResponse(uuid: string, peerId: PeerId, serverAddress: string): void;
    protected doHandshakeParse(message: WebSocket.RawData): HandshakeValues;
    /****************** Called by Simulator ************/
    handleIncomingConnection(_ufromAddress: string, _ufromInfo: PeerInfo): void;
    handleIncomingDisconnection(_ufromAddress: string, fromInfo: PeerInfo, code: DisconnectionCode, reason: DisconnectionReason | string): void;
    handleIncomingMessage(fromAddress: string, fromInfo: PeerInfo, data: string): Promise<void>;
}
