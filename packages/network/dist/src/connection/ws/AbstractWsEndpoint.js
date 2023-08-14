"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AbstractWsEndpoint = exports.UnknownPeerError = exports.DisconnectionReason = exports.DisconnectionCode = exports.Event = void 0;
const events_1 = require("events");
const utils_1 = require("@streamr/utils");
const PingPongWs_1 = require("./PingPongWs");
var Event;
(function (Event) {
    Event["PEER_CONNECTED"] = "streamr:peer:connect";
    Event["PEER_DISCONNECTED"] = "streamr:peer:disconnect";
    Event["MESSAGE_RECEIVED"] = "streamr:message-received";
    Event["HIGH_BACK_PRESSURE"] = "streamr:high-back-pressure";
    Event["LOW_BACK_PRESSURE"] = "streamr:low-back-pressure";
})(Event || (exports.Event = Event = {}));
var DisconnectionCode;
(function (DisconnectionCode) {
    DisconnectionCode[DisconnectionCode["GRACEFUL_SHUTDOWN"] = 1000] = "GRACEFUL_SHUTDOWN";
    DisconnectionCode[DisconnectionCode["FAILED_HANDSHAKE"] = 4000] = "FAILED_HANDSHAKE";
    DisconnectionCode[DisconnectionCode["DEAD_CONNECTION"] = 4001] = "DEAD_CONNECTION";
    DisconnectionCode[DisconnectionCode["DUPLICATE_SOCKET"] = 4002] = "DUPLICATE_SOCKET";
    DisconnectionCode[DisconnectionCode["INVALID_PROTOCOL_MESSAGE"] = 4003] = "INVALID_PROTOCOL_MESSAGE";
})(DisconnectionCode || (exports.DisconnectionCode = DisconnectionCode = {}));
var DisconnectionReason;
(function (DisconnectionReason) {
    DisconnectionReason["GRACEFUL_SHUTDOWN"] = "streamr:node:graceful-shutdown";
    DisconnectionReason["DUPLICATE_SOCKET"] = "streamr:endpoint:duplicate-connection";
    DisconnectionReason["NO_SHARED_STREAM_PARTS"] = "streamr:node:no-shared-stream-parts";
    DisconnectionReason["DEAD_CONNECTION"] = "dead connection";
    DisconnectionReason["INVALID_PROTOCOL_MESSAGE"] = "streamr:protocol:invalid-protocol-message";
})(DisconnectionReason || (exports.DisconnectionReason = DisconnectionReason = {}));
class UnknownPeerError extends Error {
    constructor() {
        super(...arguments);
        this.code = UnknownPeerError.CODE;
    }
}
exports.UnknownPeerError = UnknownPeerError;
UnknownPeerError.CODE = 'UnknownPeerError';
const logger = new utils_1.Logger(module);
class AbstractWsEndpoint extends events_1.EventEmitter {
    constructor(peerInfo, pingInterval) {
        super();
        this.connectionById = new Map();
        this.stopped = false;
        this.peerInfo = peerInfo;
        this.pingPongWs = new PingPongWs_1.PingPongWs(() => this.getConnections(), pingInterval);
        this.handshakeTimeoutRefs = {};
        this.handshakeTimer = 15 * 1000;
    }
    async send(recipientId, message) {
        if (this.stopped) {
            return;
        }
        const connection = this.getConnectionByPeerId(recipientId);
        if (connection !== undefined) {
            try {
                connection.evaluateBackPressure();
                await connection.send(message);
            }
            catch (err) {
                logger.debug('Failed to send message', { recipientId, err });
                connection.terminate();
                throw err;
            }
            logger.trace('Sent message', { recipientId, size: message.length });
        }
        else {
            throw new UnknownPeerError(`cannot send to ${recipientId} because not connected`);
        }
    }
    close(recipientId, code, reason) {
        const connection = this.getConnectionByPeerId(recipientId);
        if (connection !== undefined) {
            try {
                logger.trace('Close connection', { recipientId, reason });
                connection.close(code, reason);
            }
            catch (err) {
                logger.warn('Failed to close connection', { recipientId, err });
            }
        }
    }
    stop() {
        this.stopped = true;
        this.pingPongWs.stop();
        Object.keys(this.handshakeTimeoutRefs).map((id) => {
            this.clearHandshake(id);
        });
        this.handshakeTimeoutRefs = {};
        return this.doStop();
    }
    getRtts() {
        return this.pingPongWs.getRtts();
    }
    getPeers() {
        return this.connectionById;
    }
    getPeerInfos() {
        return this.getConnections().map((connection) => connection.getPeerInfo());
    }
    clearHandshake(id) {
        if (this.handshakeTimeoutRefs[id]) {
            clearTimeout(this.handshakeTimeoutRefs[id]);
            delete this.handshakeTimeoutRefs[id];
        }
    }
    /**
     * Implementer should invoke this whenever a new connection is formed
     */
    onNewConnection(connection) {
        if (this.stopped) {
            connection.close(DisconnectionCode.GRACEFUL_SHUTDOWN, DisconnectionReason.GRACEFUL_SHUTDOWN);
            return;
        }
        const peerInfo = connection.getPeerInfo();
        connection.setBackPressureHandlers(() => {
            this.emitLowBackPressure(peerInfo);
        }, () => {
            this.emitHighBackPressure(peerInfo);
        });
        this.connectionById.set(connection.getPeerId(), connection);
        logger.trace('Added peer to connection list', { peerId: connection.getPeerId() });
        this.emit(Event.PEER_CONNECTED, peerInfo);
    }
    /**
     * Implementer should invoke this whenever a message is received.
     */
    onReceive(connection, message) {
        if (this.stopped) {
            return;
        }
        logger.trace('Received message', {
            size: message.length,
            sender: connection.getPeerInfo()
        });
        this.emit(Event.MESSAGE_RECEIVED, connection.getPeerInfo(), message);
    }
    /**
     * Implementer should invoke this whenever a connection is closed.
     */
    onClose(connection, code, reason) {
        logger.trace('onClose', { peerId: connection.getPeerId(), code, reason });
        this.connectionById.delete(connection.getPeerId());
        try {
            this.doClose(connection, code, reason);
        }
        finally {
            this.emit(Event.PEER_DISCONNECTED, connection.getPeerInfo(), reason);
        }
    }
    getConnections() {
        return [...this.connectionById.values()];
    }
    getConnectionByPeerId(peerId) {
        return this.connectionById.get(peerId);
    }
    emitLowBackPressure(peerInfo) {
        this.emit(Event.LOW_BACK_PRESSURE, peerInfo);
    }
    emitHighBackPressure(peerInfo) {
        this.emit(Event.HIGH_BACK_PRESSURE, peerInfo);
    }
}
exports.AbstractWsEndpoint = AbstractWsEndpoint;
//# sourceMappingURL=AbstractWsEndpoint.js.map