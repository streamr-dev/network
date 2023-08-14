"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NodeClientWsConnection = void 0;
const AbstractWsConnection_1 = require("../connection/ws/AbstractWsConnection");
const AbstractWsEndpoint_1 = require("../connection/ws/AbstractWsEndpoint");
//import { Logger } from '../helpers/Logger'
//import { WebSocketConnectionFactory } from "./AbstractClientWsEndpoint_simulator"
const Simulator_1 = require("./Simulator");
//const staticLogger = new Logger(module)
/*
export const NodeWebSocketConnectionFactory: WebSocketConnectionFactory<NodeClientWsConnection> = Object.freeze({
    createConnection(peerInfo: PeerInfo): NodeClientWsConnection {
        return new NodeClientWsConnection(peerInfo)
    }
})
*/
class NodeClientWsConnection extends AbstractWsConnection_1.AbstractWsConnection {
    constructor(ownAddress, ownPeerInfo, remoteAddress, remotePeerInfo, endpoint) {
        super(remotePeerInfo);
        this.readyState = 1;
        this.ownAddress = ownAddress;
        this.ownPeerInfo = ownPeerInfo;
        this.remoteAddress = remoteAddress;
        this.endpoint = endpoint;
    }
    close(code, reason) {
        Simulator_1.Simulator.instance().wsDisconnect(this.ownAddress, this.ownPeerInfo, this.remoteAddress, code, reason);
        this.readyState = 3;
        this.endpoint.doOnClose(this, code, reason);
    }
    terminate() {
        Simulator_1.Simulator.instance().wsDisconnect(this.ownAddress, this.ownPeerInfo, this.remoteAddress, AbstractWsEndpoint_1.DisconnectionCode.GRACEFUL_SHUTDOWN, AbstractWsEndpoint_1.DisconnectionReason.GRACEFUL_SHUTDOWN);
        this.readyState = 3;
        this.endpoint.doOnClose(this, AbstractWsEndpoint_1.DisconnectionCode.DEAD_CONNECTION, '');
    }
    // eslint-disable-next-line class-methods-use-this
    getBufferedAmount() {
        return 0;
    }
    getReadyState() {
        return this.readyState;
    }
    sendPing() {
        Simulator_1.Simulator.instance().wsSend(this.ownAddress, this.ownPeerInfo, this.remoteAddress, "ping").then(() => { return; }).catch((_ue) => { });
    }
    async send(message) {
        const readyState = this.getReadyState();
        if (this.getReadyState() !== 1) {
            throw new Error(`cannot send, readyState is ${readyState}`);
        }
        try {
            await Simulator_1.Simulator.instance().wsSend(this.ownAddress, this.ownPeerInfo, this.remoteAddress, message);
        }
        catch (err) {
            return Promise.reject(err);
        }
    }
}
exports.NodeClientWsConnection = NodeClientWsConnection;
//# sourceMappingURL=NodeClientWsConnection_simulator.js.map