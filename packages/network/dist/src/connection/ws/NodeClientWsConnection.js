"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NodeClientWsConnection = exports.NodeWebSocketConnectionFactory = void 0;
const AbstractWsConnection_1 = require("./AbstractWsConnection");
const util_1 = __importDefault(require("util"));
const utils_1 = require("@streamr/utils");
const logger = new utils_1.Logger(module);
exports.NodeWebSocketConnectionFactory = Object.freeze({
    createConnection(socket, peerInfo) {
        return new NodeClientWsConnection(socket, peerInfo);
    }
});
class NodeClientWsConnection extends AbstractWsConnection_1.AbstractWsConnection {
    constructor(socket, peerInfo) {
        super(peerInfo);
        this.socket = socket;
    }
    close(code, reason) {
        try {
            this.socket.close(code, reason);
        }
        catch (e) {
            logger.error('Failed to close connection', e);
        }
    }
    terminate() {
        try {
            this.socket.terminate();
        }
        catch (e) {
            logger.error('Failed to terminate connection', e);
        }
    }
    getBufferedAmount() {
        return this.socket.bufferedAmount;
    }
    getReadyState() {
        return this.socket.readyState;
    }
    sendPing() {
        this.socket.ping();
    }
    async send(message) {
        await util_1.default.promisify((cb) => this.socket.send(message, cb))();
    }
}
exports.NodeClientWsConnection = NodeClientWsConnection;
//# sourceMappingURL=NodeClientWsConnection.js.map