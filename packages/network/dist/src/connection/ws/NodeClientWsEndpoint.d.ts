import WebSocket from 'ws';
import { PeerId, PeerInfo } from '../PeerInfo';
import { NodeClientWsConnection } from './NodeClientWsConnection';
import { AbstractClientWsEndpoint, HandshakeValues, ServerUrl } from "./AbstractClientWsEndpoint";
export default class NodeClientWsEndpoint extends AbstractClientWsEndpoint<NodeClientWsConnection> {
    protected doConnect(serverUrl: ServerUrl, serverPeerInfo: PeerInfo): Promise<PeerId>;
    protected doSetUpConnection(ws: WebSocket, serverPeerInfo: PeerInfo): NodeClientWsConnection;
    protected doHandshakeResponse(uuid: string, _peerId: PeerId, ws: WebSocket): void;
    protected doHandshakeParse(message: WebSocket.RawData): HandshakeValues;
}
