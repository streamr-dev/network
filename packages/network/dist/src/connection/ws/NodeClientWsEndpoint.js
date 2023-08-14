"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = __importDefault(require("ws"));
const AbstractWsEndpoint_1 = require("./AbstractWsEndpoint");
const NodeClientWsConnection_1 = require("./NodeClientWsConnection");
const AbstractClientWsEndpoint_1 = require("./AbstractClientWsEndpoint");
const utils_1 = require("@streamr/utils");
const logger = new utils_1.Logger(module);
class NodeClientWsEndpoint extends AbstractClientWsEndpoint_1.AbstractClientWsEndpoint {
    doConnect(serverUrl, serverPeerInfo) {
        return new Promise((resolve, reject) => {
            try {
                const ws = new ws_1.default(`${serverUrl}/ws`);
                ws.once('open', () => {
                    this.handshakeInit(ws, serverPeerInfo, reject);
                });
                ws.on('message', (message) => {
                    this.handshakeListener(ws, serverPeerInfo, serverUrl, message, resolve);
                });
                ws.on('close', (code, reason) => {
                    this.onHandshakeClosed(serverUrl, code, reason.toString(), reject);
                });
                ws.on('error', (err) => {
                    this.onHandshakeError(serverUrl, err, reject);
                });
            }
            catch (err) {
                logger.trace('Failed to connect to server', { serverUrl, err });
                reject(err);
            }
        });
    }
    doSetUpConnection(ws, serverPeerInfo) {
        const connection = NodeClientWsConnection_1.NodeWebSocketConnectionFactory.createConnection(ws, serverPeerInfo);
        ws.on('message', (message) => {
            this.onReceive(connection, message.toString());
        });
        ws.on('pong', () => {
            connection.onPong();
        });
        ws.once('close', (code, reason) => {
            this.onClose(connection, code, reason);
            if (code === AbstractWsEndpoint_1.DisconnectionCode.DUPLICATE_SOCKET) {
                logger.warn('Refused connection (Duplicate nodeId detected, are you running multiple nodes with the same private key?)');
            }
            else if (code === AbstractWsEndpoint_1.DisconnectionCode.INVALID_PROTOCOL_MESSAGE) {
                logger.warn('Refused connection (Invalid protocol message format detected, are you running an outdated version?)');
            }
        });
        ws.on('error', (err) => {
            this.ongoingConnectionError(serverPeerInfo.peerId, err, connection);
        });
        return connection;
    }
    // eslint-disable-next-line class-methods-use-this
    doHandshakeResponse(uuid, _peerId, ws) {
        ws.send(JSON.stringify({ uuid, peerId: this.peerInfo.peerId }));
    }
    // eslint-disable-next-line class-methods-use-this
    doHandshakeParse(message) {
        const { uuid, peerId } = JSON.parse(message.toString());
        return {
            uuid,
            peerId
        };
    }
}
exports.default = NodeClientWsEndpoint;
//# sourceMappingURL=NodeClientWsEndpoint.js.map