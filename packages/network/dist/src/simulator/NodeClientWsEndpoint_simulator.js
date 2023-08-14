"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const AbstractWsEndpoint_1 = require("../connection/ws/AbstractWsEndpoint");
const NodeClientWsConnection_simulator_1 = require("./NodeClientWsConnection_simulator");
const AbstractClientWsEndpoint_simulator_1 = require("./AbstractClientWsEndpoint_simulator");
const Simulator_1 = require("./Simulator");
const utils_1 = require("@streamr/utils");
const logger = new utils_1.Logger(module);
class NodeClientWsEndpoint extends AbstractClientWsEndpoint_simulator_1.AbstractClientWsEndpoint {
    constructor(peerInfo, pingInterval) {
        super(peerInfo, pingInterval);
        this.pendingHandshakes = {};
        this.newConnection = (serverAddress, serverPeerInfo) => {
            return new NodeClientWsConnection_simulator_1.NodeClientWsConnection(this.ownAddress, this.peerInfo, serverAddress, serverPeerInfo, this);
        };
        Simulator_1.Simulator.instance().addClientWsEndpoint(peerInfo, this.ownAddress, this);
    }
    doConnect(serverUrl, serverPeerInfo) {
        return new Promise((resolve, reject) => {
            try {
                this.pendingHandshakes[serverPeerInfo.peerId] = [resolve, reject, serverPeerInfo];
                this.handshakeInit(serverUrl, serverPeerInfo, reject);
                Simulator_1.Simulator.instance().wsConnect(this.ownAddress, this.peerInfo, serverUrl);
            }
            catch (err) {
                logger.trace(`failed to connect to ${serverUrl}, error: ${err}`);
                reject(err);
            }
        });
    }
    doOnClose(connection, code, reason) {
        this.onClose(connection, code, reason);
    }
    doSetUpConnection(serverPeerInfo, serverAddress) {
        const connection = this.newConnection(serverAddress, serverPeerInfo);
        return connection;
    }
    // eslint-disable-next-line class-methods-use-this
    doHandshakeResponse(uuid, peerId, serverAddress) {
        delete this.pendingHandshakes[peerId];
        Simulator_1.Simulator.instance().wsSend(this.ownAddress, this.peerInfo, serverAddress, JSON.stringify({ uuid, peerId: this.peerInfo.peerId }));
        //ws.send(JSON.stringify({ uuid, peerId: this.peerInfo.peerId }))
    }
    // eslint-disable-next-line class-methods-use-this
    doHandshakeParse(message) {
        const { uuid, peerId } = JSON.parse(message.toString());
        return {
            uuid,
            peerId
        };
    }
    /****************** Called by Simulator ************/
    //not implemented in client socket
    // eslint-disable-next-line class-methods-use-this
    handleIncomingConnection(_ufromAddress, _ufromInfo) { }
    handleIncomingDisconnection(_ufromAddress, fromInfo, code, reason) {
        if (this.pendingHandshakes.hasOwnProperty(fromInfo.peerId)) {
            this.onHandshakeClosed(this.getServerUrlByPeerId(fromInfo.peerId), code, reason, this.pendingHandshakes[fromInfo.peerId][1]);
            delete this.pendingHandshakes[fromInfo.peerId];
        }
        else {
            const connection = this.getConnectionByPeerId(fromInfo.peerId);
            if (connection) {
                this.onClose(connection, code, reason);
                if (code === AbstractWsEndpoint_1.DisconnectionCode.DUPLICATE_SOCKET) {
                    logger.warn('Connection refused: Duplicate nodeId detected, are you running multiple nodes with the same private key?');
                }
            }
        }
    }
    async handleIncomingMessage(fromAddress, fromInfo, data) {
        const connection = this.getConnectionByPeerId(fromInfo.peerId);
        const parsed = data.toString();
        if (parsed === 'ping') {
            await this.send(fromInfo.peerId, 'pong');
        }
        else if (parsed === 'pong') {
            connection.onPong();
        }
        else if (this.pendingHandshakes.hasOwnProperty(fromInfo.peerId)) {
            try {
                const { uuid, peerId } = JSON.parse(parsed);
                if (uuid && peerId && this.pendingHandshakes.hasOwnProperty(fromInfo.peerId)) {
                    // eslint-disable-next-line max-len
                    this.handshakeListener(this.pendingHandshakes[fromInfo.peerId][2], fromAddress, Buffer.from(data), this.pendingHandshakes[fromInfo.peerId][0]);
                }
                else {
                    this.onReceive(connection, data);
                }
            }
            catch (err) {
                logger.trace(err);
                this.onReceive(connection, data);
            }
        }
        else {
            this.onReceive(connection, data);
        }
    }
}
exports.default = NodeClientWsEndpoint;
//# sourceMappingURL=NodeClientWsEndpoint_simulator.js.map