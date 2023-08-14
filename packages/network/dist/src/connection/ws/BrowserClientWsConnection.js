"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrowserClientWsConnection = exports.BrowserWebSocketConnectionFactory = void 0;
const AbstractWsConnection_1 = require("./AbstractWsConnection");
const utils_1 = require("@streamr/utils");
const logger = new utils_1.Logger(module);
exports.BrowserWebSocketConnectionFactory = Object.freeze({
    createConnection(socket, peerInfo) {
        return new BrowserClientWsConnection(socket, peerInfo);
    }
});
class BrowserClientWsConnection extends AbstractWsConnection_1.AbstractWsConnection {
    constructor(socket, peerInfo) {
        super(peerInfo);
        this.socket = socket;
    }
    close(code, reason) {
        try {
            this.socket.close(code, reason);
        }
        catch (err) {
            logger.error('Failed to close connection', err);
        }
    }
    terminate() {
        try {
            this.socket.close();
        }
        catch (err) {
            logger.error('Failed to terminate connection', err);
        }
    }
    getBufferedAmount() {
        return this.socket.bufferedAmount;
    }
    getReadyState() {
        return this.socket.readyState;
    }
    // TODO: toString() representation for logging
    sendPing() {
        this.socket.send('ping');
    }
    async send(message) {
        this.socket.send(message);
    }
}
exports.BrowserClientWsConnection = BrowserClientWsConnection;
//# sourceMappingURL=BrowserClientWsConnection.js.map