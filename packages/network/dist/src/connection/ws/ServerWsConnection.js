"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServerWsConnection = exports.logger = void 0;
const AbstractWsConnection_1 = require("./AbstractWsConnection");
const utils_1 = require("@streamr/utils");
const util_1 = __importDefault(require("util"));
exports.logger = new utils_1.Logger(module);
class ServerWsConnection extends AbstractWsConnection_1.AbstractWsConnection {
    constructor(socket, duplexStream, remoteAddress, peerInfo) {
        super(peerInfo);
        this.socket = socket;
        this.duplexStream = duplexStream;
        this.remoteAddress = remoteAddress;
    }
    close(code, reason) {
        try {
            this.socket.close(code, reason);
        }
        catch (e) {
            exports.logger.error('Failed to close connection', e);
        }
    }
    terminate() {
        try {
            this.socket.terminate();
        }
        catch (e) {
            exports.logger.error('Failed to terminate connection', e);
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
        const readyState = this.getReadyState();
        if (this.getReadyState() !== 1) {
            throw new Error(`cannot send, readyState is ${readyState}`);
        }
        try {
            await util_1.default.promisify((cb) => this.duplexStream.write(message, cb))();
        }
        catch (err) {
            return Promise.reject(err);
        }
    }
    getRemoteAddress() {
        return this.remoteAddress;
    }
}
exports.ServerWsConnection = ServerWsConnection;
//# sourceMappingURL=ServerWsConnection.js.map