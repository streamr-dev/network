"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AbstractClientWsEndpoint = void 0;
const AbstractWsEndpoint_1 = require("./AbstractWsEndpoint");
const utils_1 = require("@streamr/utils");
const logger = new utils_1.Logger(module);
class AbstractClientWsEndpoint extends AbstractWsEndpoint_1.AbstractWsEndpoint {
    constructor(peerInfo, pingInterval) {
        super(peerInfo, pingInterval);
        this.connectionsByServerUrl = new Map();
        this.serverUrlByPeerId = new Map();
        this.pendingConnections = new Map();
    }
    getServerUrlByPeerId(peerId) {
        return this.serverUrlByPeerId.get(peerId);
    }
    doClose(connection, _code, _reason) {
        const serverUrl = this.serverUrlByPeerId.get(connection.getPeerId());
        this.connectionsByServerUrl.delete(serverUrl);
        this.serverUrlByPeerId.delete(connection.getPeerId());
    }
    async doStop() {
        this.getConnections().forEach((connection) => {
            connection.close(AbstractWsEndpoint_1.DisconnectionCode.GRACEFUL_SHUTDOWN, AbstractWsEndpoint_1.DisconnectionReason.GRACEFUL_SHUTDOWN);
        });
    }
    connect(serverUrl, serverPeerInfo) {
        // Check for existing connection and its state
        const existingConnection = this.connectionsByServerUrl.get(serverUrl);
        if (existingConnection !== undefined) {
            if (existingConnection.getReadyState() === 1) {
                return Promise.resolve(existingConnection.getPeerId());
            }
            logger.trace('Close connection (readyState not connected)', {
                serverUrl,
                readyState: existingConnection.getReadyState()
            });
            this.close(existingConnection.getPeerId(), AbstractWsEndpoint_1.DisconnectionCode.DEAD_CONNECTION, AbstractWsEndpoint_1.DisconnectionReason.DEAD_CONNECTION);
        }
        // Check for pending connection
        const pendingConnection = this.pendingConnections.get(serverUrl);
        if (pendingConnection !== undefined) {
            return pendingConnection;
        }
        // Perform connection
        logger.trace('Connect to server', { serverUrl });
        const p = this.doConnect(serverUrl, serverPeerInfo).finally(() => {
            this.pendingConnections.delete(serverUrl);
        });
        this.pendingConnections.set(serverUrl, p);
        return p;
    }
    /**
     * Init client-side handshake timeout
     */
    handshakeInit(ws, serverPeerInfo, reject) {
        const peerId = serverPeerInfo.peerId;
        this.handshakeTimeoutRefs[peerId] = setTimeout(() => {
            ws.close(AbstractWsEndpoint_1.DisconnectionCode.FAILED_HANDSHAKE, `Handshake not received from ${peerId}`);
            logger.warn('Timed out waiting for handshake from peer', { peerId });
            delete this.handshakeTimeoutRefs[peerId];
            reject(`Handshake not received from ${peerId}`);
        }, this.handshakeTimer);
    }
    /**
     * Initial handshake message listener
     */
    handshakeListener(ws, serverPeerInfo, serverUrl, message, resolve) {
        try {
            const { uuid, peerId } = this.doHandshakeParse(message);
            if (uuid && peerId === serverPeerInfo.peerId) {
                this.clearHandshake(peerId);
                this.doHandshakeResponse(uuid, peerId, ws);
                resolve(this.setUpConnection(ws, serverPeerInfo, serverUrl));
            }
            else {
                logger.trace('Received unexpected message (expected a handshake message)', {
                    gotInstead: message?.toString()
                });
            }
        }
        catch (err) {
            logger.trace('handshakeListener', err);
        }
    }
    // eslint-disable-next-line class-methods-use-this
    onHandshakeError(serverUrl, error, reject) {
        logger.trace('onHandshakeError', { serverUrl, error });
        reject(error);
    }
    // eslint-disable-next-line class-methods-use-this
    onHandshakeClosed(serverUrl, code, reason, reject) {
        logger.trace('onHandshakeClosed', { serverUrl, code, reason });
        reject(reason);
    }
    // eslint-disable-next-line class-methods-use-this
    ongoingConnectionError(serverPeerId, error, connection) {
        logger.trace('ongoingConnectionError', { serverPeerId, error });
        connection.terminate();
    }
    setUpConnection(ws, serverPeerInfo, serverUrl) {
        const connection = this.doSetUpConnection(ws, serverPeerInfo);
        this.connectionsByServerUrl.set(serverUrl, connection);
        this.serverUrlByPeerId.set(connection.getPeerId(), serverUrl);
        this.onNewConnection(connection);
        return connection.getPeerId();
    }
    getDiagnosticInfo() {
        return {
            connections: this.getConnections().map((c) => c.getDiagnosticInfo()),
            serverUrls: Object.fromEntries(this.serverUrlByPeerId),
            pendingConnections: Object.keys(this.pendingConnections)
        };
    }
}
exports.AbstractClientWsEndpoint = AbstractClientWsEndpoint;
//# sourceMappingURL=AbstractClientWsEndpoint.js.map