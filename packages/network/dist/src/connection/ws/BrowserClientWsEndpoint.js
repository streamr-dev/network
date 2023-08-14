"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const websocket_1 = require("websocket");
const AbstractWsEndpoint_1 = require("./AbstractWsEndpoint");
const BrowserClientWsConnection_1 = require("./BrowserClientWsConnection");
const AbstractClientWsEndpoint_1 = require("./AbstractClientWsEndpoint");
const utils_1 = require("@streamr/utils");
const logger = new utils_1.Logger(module);
class BrowserClientWsEndpoint extends AbstractClientWsEndpoint_1.AbstractClientWsEndpoint {
    doConnect(serverUrl, serverPeerInfo) {
        return new Promise((resolve, reject) => {
            try {
                const ws = new websocket_1.w3cwebsocket(serverUrl);
                ws.onopen = () => {
                    this.handshakeInit(ws, serverPeerInfo, reject);
                };
                ws.onmessage = (message) => {
                    this.handshakeListener(ws, serverPeerInfo, serverUrl, message, resolve);
                };
                ws.onerror = (error) => {
                    this.onHandshakeError(serverUrl, error, reject);
                };
                ws.onclose = (event) => {
                    this.onHandshakeClosed(serverUrl, event.code, event.reason, reject);
                };
            }
            catch (err) {
                logger.trace('Failed to connect to server', { serverUrl, err });
                reject(err);
            }
        });
    }
    doSetUpConnection(ws, serverPeerInfo) {
        const connection = BrowserClientWsConnection_1.BrowserWebSocketConnectionFactory.createConnection(ws, serverPeerInfo);
        ws.onmessage = (message) => {
            const parsedMsg = message.data.toString();
            if (parsedMsg === 'pong') {
                connection.onPong();
            }
            else {
                this.onReceive(connection, parsedMsg);
            }
        };
        ws.onclose = (event) => {
            this.onClose(connection, event.code, event.reason);
            if (event.code === AbstractWsEndpoint_1.DisconnectionCode.DUPLICATE_SOCKET) {
                logger.warn('Refused connection (Duplicate nodeId detected, are you running multiple nodes with the same private key?)');
            }
            else if (event.code === AbstractWsEndpoint_1.DisconnectionCode.INVALID_PROTOCOL_MESSAGE) {
                logger.warn('Refused connection (Invalid protocol message format detected, are you running an outdated version?)');
            }
        };
        ws.onerror = (error) => {
            this.ongoingConnectionError(serverPeerInfo.peerId, error, connection);
        };
        return connection;
    }
    // eslint-disable-next-line class-methods-use-this
    doHandshakeResponse(uuid, _peerId, ws) {
        ws.send(JSON.stringify({ uuid, peerId: this.peerInfo.peerId }));
    }
    // eslint-disable-next-line class-methods-use-this
    doHandshakeParse(message) {
        const { uuid, peerId } = JSON.parse(message.data.toString());
        return {
            uuid,
            peerId
        };
    }
}
exports.default = BrowserClientWsEndpoint;
//# sourceMappingURL=BrowserClientWsEndpoint.js.map