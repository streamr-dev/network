import { IMessageEvent, w3cwebsocket } from 'websocket';
import { PeerId, PeerInfo } from '../PeerInfo';
import { BrowserClientWsConnection } from './BrowserClientWsConnection';
import { AbstractClientWsEndpoint, HandshakeValues } from "./AbstractClientWsEndpoint";
export default class BrowserClientWsEndpoint extends AbstractClientWsEndpoint<BrowserClientWsConnection> {
    protected doConnect(serverUrl: string, serverPeerInfo: PeerInfo): Promise<PeerId>;
    protected doSetUpConnection(ws: w3cwebsocket, serverPeerInfo: PeerInfo): BrowserClientWsConnection;
    protected doHandshakeResponse(uuid: string, _peerId: PeerId, ws: w3cwebsocket): void;
    protected doHandshakeParse(message: IMessageEvent): HandshakeValues;
}
