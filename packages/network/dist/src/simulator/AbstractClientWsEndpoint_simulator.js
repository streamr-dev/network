"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AbstractClientWsEndpoint = void 0;
const AbstractWsEndpoint_1 = require("../connection/ws/AbstractWsEndpoint");
const Simulator_1 = require("./Simulator");
const uuid_1 = require("uuid");
const utils_1 = require("@streamr/utils");
/*
export interface WebSocketConnectionFactory<C extends AbstractWsConnection> {
    createConnection(peerInfo: PeerInfo): C
}
*/
const logger = new utils_1.Logger(module);
class AbstractClientWsEndpoint extends AbstractWsEndpoint_1.AbstractWsEndpoint {
    constructor(peerInfo, pingInterval) {
        super(peerInfo, pingInterval);
        this.ownAddress = (0, uuid_1.v4)();
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
        serverUrl = (0, Simulator_1.cleanAddress)(serverUrl);
        const existingConnection = this.connectionsByServerUrl.get(serverUrl);
        if (existingConnection !== undefined) {
            if (existingConnection.getReadyState() === 1) {
                return Promise.resolve(existingConnection.getPeerId());
            }
            logger.trace(`supposedly connected to ${serverUrl} but readyState is ${existingConnection.getReadyState()}, closing connection`);
            this.close(existingConnection.getPeerId(), AbstractWsEndpoint_1.DisconnectionCode.DEAD_CONNECTION, AbstractWsEndpoint_1.DisconnectionReason.DEAD_CONNECTION);
        }
        // Check for pending connection
        const pendingConnection = this.pendingConnections.get(serverUrl);
        if (pendingConnection !== undefined) {
            return pendingConnection;
        }
        // Perform connection
        logger.trace(`connecting to ${serverUrl}`);
        const p = this.doConnect(serverUrl, serverPeerInfo).then((peerId) => {
            if (this.connectionsByServerUrl.get(serverUrl)) {
                this.onNewConnection(this.connectionsByServerUrl.get(serverUrl));
                return peerId;
            }
            else {
                return peerId;
                //throw new Error('Connection failed')
            }
        }).finally(() => {
            this.pendingConnections.delete(serverUrl);
        });
        this.pendingConnections.set(serverUrl, p);
        return p;
    }
    /**
     * Init client-side handshake timeout
     */
    handshakeInit(serverAddress, serverPeerInfo, reject) {
        const peerId = serverPeerInfo.peerId;
        this.handshakeTimeoutRefs[peerId] = setTimeout(() => {
            //ws.close(DisconnectionCode.FAILED_HANDSHAKE, `Handshake not received from ${peerId}`)
            Simulator_1.Simulator.instance().wsDisconnect(this.ownAddress, this.peerInfo, serverAddress, AbstractWsEndpoint_1.DisconnectionCode.FAILED_HANDSHAKE, `Handshake not received from ${peerId}`);
            logger.warn(`Client: Handshake not received from ${peerId}`);
            delete this.handshakeTimeoutRefs[peerId];
            reject(`Handshake not received from ${peerId}`);
        }, this.handshakeTimer);
    }
    /**
     * Initial handshake message listener
     */
    handshakeListener(serverPeerInfo, serverUrl, message, resolve) {
        try {
            const { uuid, peerId } = this.doHandshakeParse(message);
            if (uuid && peerId === serverPeerInfo.peerId) {
                this.clearHandshake(peerId);
                const id = this.setUpConnection(serverPeerInfo, serverUrl);
                this.doHandshakeResponse(uuid, peerId, serverUrl);
                resolve(id);
            }
            else {
                logger.trace('Expected a handshake message got: ' + message);
            }
        }
        catch (err) {
            logger.trace(err);
        }
    }
    // eslint-disable-next-line class-methods-use-this
    onHandshakeError(serverUrl, error, reject) {
        logger.trace(`failed to connect to ${serverUrl}, error: ${error}`);
        reject(error);
    }
    // eslint-disable-next-line class-methods-use-this
    onHandshakeClosed(serverUrl, code, reason, reject) {
        logger.trace(`Connection to ${serverUrl} closed during handshake with code: ${code}, reason ${reason}`);
        reject(reason);
    }
    // eslint-disable-next-line class-methods-use-this
    ongoingConnectionError(serverPeerId, error, connection) {
        logger.trace(`Connection to ${serverPeerId} failed, error: ${error}`);
        connection.terminate();
    }
    setUpConnection(serverPeerInfo, serverUrl) {
        const connection = this.doSetUpConnection(serverPeerInfo, serverUrl);
        this.connectionsByServerUrl.set(serverUrl, connection);
        // @ts-expect-error private field
        this.connectionById.set(connection.getPeerId(), connection);
        this.serverUrlByPeerId.set(connection.getPeerId(), serverUrl);
        return connection.getPeerId();
    }
}
exports.AbstractClientWsEndpoint = AbstractClientWsEndpoint;
//# sourceMappingURL=AbstractClientWsEndpoint_simulator.js.map