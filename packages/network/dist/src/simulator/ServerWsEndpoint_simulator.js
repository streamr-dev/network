"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startHttpServer = exports.ServerWsEndpoint = void 0;
/* eslint-disable no-prototype-builtins */
const Simulator_1 = require("./Simulator");
const PeerInfo_1 = require("../connection/PeerInfo");
const AbstractWsEndpoint_1 = require("../connection/ws/AbstractWsEndpoint");
const ServerWsConnection_simulator_1 = require("./ServerWsConnection_simulator");
const fs_1 = __importDefault(require("fs"));
const net_1 = __importDefault(require("net"));
const https_1 = __importDefault(require("https"));
const http_1 = __importDefault(require("http"));
const events_1 = require("events");
const uuid_1 = require("uuid");
const utils_1 = require("@streamr/utils");
const logger = new utils_1.Logger(module);
class ServerWsEndpoint extends AbstractWsEndpoint_1.AbstractWsEndpoint {
    constructor(listen, sslEnabled, httpServer, peerInfo, pingInterval) {
        super(peerInfo, pingInterval);
        this.handshakeListeners = {};
        this.httpServer = httpServer;
        const protocol = sslEnabled ? 'wss' : 'ws';
        if (typeof listen !== "string") {
            this.serverUrl = `${protocol}://${listen.hostname}:${listen.port}`;
        }
        else {
            this.serverUrl = `${protocol}+unix://${listen}`;
        }
        this.ownAddress = listen.hostname + ':' + listen.port;
        Simulator_1.Simulator.instance().addServerWsEndpoint(peerInfo, listen.hostname, listen.port, this);
        //this.wss = this.startWsServer()
    }
    /****************** Called by Simulator ************/
    handleIncomingConnection(fromAddress, _ufromInfo) {
        if (!this.handshakeListeners.hasOwnProperty(fromAddress)) {
            this.handshakeListeners[fromAddress] = {};
        }
        const handshakeUUID = (0, uuid_1.v4)();
        //let otherNodeIdForLogging = 'unknown (no handshake)'
        this.handshakeListeners[fromAddress][handshakeUUID] = async (data) => {
            try {
                const { uuid, peerId } = JSON.parse(data);
                if (uuid === handshakeUUID && peerId) {
                    //otherNodeIdForLogging = peerId
                    this.clearHandshake(uuid);
                    delete this.handshakeListeners[fromAddress][uuid];
                    if (Object.keys(this.handshakeListeners[fromAddress]).length == 0) {
                        delete this.handshakeListeners[fromAddress];
                    }
                    // Check that a client with the same peerId has not already connected to the server.
                    if (!this.getConnectionByPeerId(peerId)) {
                        this.acceptConnection(peerId, fromAddress);
                    }
                    else {
                        const failedMessage = `Connection for node: ${peerId} has already been established, rejecting duplicate`;
                        Simulator_1.Simulator.instance().wsDisconnect(this.ownAddress, this.peerInfo, fromAddress, AbstractWsEndpoint_1.DisconnectionCode.DUPLICATE_SOCKET, failedMessage);
                        logger.warn(failedMessage + " " + data);
                    }
                }
                else {
                    logger.trace('Expected a handshake message got: ' + data.toString());
                }
            }
            catch (err) {
                logger.trace(err);
            }
        };
        this.handshakeTimeoutRefs[handshakeUUID] = setTimeout(() => {
            Simulator_1.Simulator.instance().wsDisconnect(this.ownAddress, this.peerInfo, fromAddress, AbstractWsEndpoint_1.DisconnectionCode.FAILED_HANDSHAKE, `Handshake not received from connection behind UUID ${handshakeUUID}`);
            //ws.close(DisconnectionCode.FAILED_HANDSHAKE, `Handshake not received from connection behind UUID ${handshakeUUID}`)
            logger.warn(`Server: Handshake not received from connection behind UUID ${handshakeUUID}`);
            delete this.handshakeTimeoutRefs[handshakeUUID];
        }, this.handshakeTimer);
        Simulator_1.Simulator.instance().wsSend(this.ownAddress, this.peerInfo, fromAddress, JSON.stringify({ uuid: handshakeUUID, peerId: this.peerInfo.peerId }));
    }
    handleIncomingDisconnection(_fromAddress, fromInfo, code, reason) {
        if (this.getConnectionByPeerId(fromInfo.peerId)) {
            this.onClose(this.getConnectionByPeerId(fromInfo.peerId), code, reason);
        }
    }
    async handleIncomingMessage(fromAddress, fromInfo, data) {
        if (data === 'ping') {
            await this.send(fromInfo.peerId, 'pong');
        }
        else if (data === 'pong') {
            const connection = this.getConnectionByPeerId(fromInfo.peerId);
            connection.onPong();
        }
        else if (this.handshakeListeners.hasOwnProperty(fromAddress) && Object.keys(this.handshakeListeners[fromAddress]).length > 0) {
            try {
                const { uuid, peerId } = JSON.parse(data);
                if (uuid && peerId && this.handshakeListeners[fromAddress].hasOwnProperty(uuid)) {
                    this.handshakeListeners[fromAddress][uuid](data);
                }
                else {
                    const connection = this.getConnectionByPeerId(fromInfo.peerId);
                    this.onReceive(connection, data.toString());
                }
            }
            catch (err) {
                const connection = this.getConnectionByPeerId(fromInfo.peerId);
                logger.trace(err);
                this.onReceive(connection, data.toString());
            }
        }
        else {
            const connection = this.getConnectionByPeerId(fromInfo.peerId);
            this.onReceive(connection, data);
        }
    }
    /****************** Called by Simulator ends *******/
    /*
    private startWsServer(): WebSocket.Server {
        return new WebSocket.Server({
            server: this.httpServer,
            maxPayload: 1024 * 1024
        }).on('error', (err: Error) => {
            this.logger.error('web socket server (wss) emitted error: %s', err)
        }).on('listening', () => {
            this.logger.trace('listening on %s', this.getUrl())
        }).on('connection', (ws: WebSocket, request: http.IncomingMessage) => {
            const handshakeUUID = v4()

            ws.send(JSON.stringify({ uuid: handshakeUUID, peerId: this.peerInfo.peerId }))

            this.handshakeTimeoutRefs[handshakeUUID] = setTimeout(() => {
                ws.close(DisconnectionCode.FAILED_HANDSHAKE, `Handshake not received from connection behind UUID ${handshakeUUID}`)
                this.logger.warn(`Handshake not received from connection behind UUID ${handshakeUUID}`)
                ws.terminate()
                delete this.handshakeTimeoutRefs[handshakeUUID]
            }, this.handshakeTimer)

            const duplexStream = WebSocket.createWebSocketStream(ws, {
                decodeStrings: false
            })

            let otherNodeIdForLogging = 'unknown (no handshake)'

            duplexStream.on('data', async (data: WebSocket.Data) => {
                try {
                    const { uuid, peerId } = JSON.parse(data.toString())
                    if (uuid === handshakeUUID && peerId) {
                        otherNodeIdForLogging = peerId
                        this.clearHandshake(uuid)

                        // Check that a client with the same peerId has not already connected to the server.
                        if (!this.getConnectionByPeerId(peerId)) {
                            this.acceptConnection(ws, duplexStream, peerId, this.resolveIP(request))
                        } else {
                            this.metrics.record('open:duplicateSocket', 1)
                            const failedMessage = `Connection for node: ${peerId} has already been established, rejecting duplicate`
                            ws.close(DisconnectionCode.DUPLICATE_SOCKET, failedMessage)
                            this.logger.warn(failedMessage)
                        }
                    } else {
                        this.logger.trace('Expected a handshake message got: ' + data.toString())
                    }
                } catch (err) {
                    this.logger.trace(err)
                }
            })

            ws.on('error', (err) => {
                this.logger.warn('socket for "%s" emitted error: %s', otherNodeIdForLogging, err)
            })
        })
    }
    */
    acceptConnection(peerId, remoteAddress) {
        const connection = new ServerWsConnection_simulator_1.ServerWsConnection(this.ownAddress, this.peerInfo, remoteAddress, PeerInfo_1.PeerInfo.newNode(peerId));
        this.onNewConnection(connection);
    }
    getUrl() {
        return this.serverUrl;
    }
    resolveAddress(peerId) {
        return this.getConnectionByPeerId(peerId)?.getRemoteAddress();
    }
    // eslint-disable-next-line class-methods-use-this
    doClose(_connection, _code, _reason) { }
    async doStop() {
        if (this.httpServer) {
            return new Promise((resolve, reject) => {
                this.httpServer?.close((err) => {
                    if (err) {
                        logger.error(`error closing http server: ${err}`);
                        reject(err);
                    }
                    else {
                        resolve();
                    }
                });
            });
        }
        /*
        return new Promise((resolve, reject) => {
            this.wss.close((err?) => {
                if (err) {
                    this.logger.error('error on closing websocket server: %s', err)
                }
                this.httpServer.close((err?) => {
                    if (err) {
                        this.logger.error('error closing http server: %s', err)
                        reject(err)
                    } else {
                        resolve()
                    }
                })
            })
        })*/
    }
}
exports.ServerWsEndpoint = ServerWsEndpoint;
function cleanSocket(httpServer, config) {
    httpServer.on('error', (err) => {
        // rethrow if unexpected error
        if (!err.message.includes('EADDRINUSE')) {
            throw err;
        }
        ServerWsConnection_simulator_1.staticLogger.info(`socket in use, trying to recover: ${config}`);
        ServerWsConnection_simulator_1.staticLogger.trace('checking if socket in use by another server');
        const clientSocket = new net_1.default.Socket();
        // socket will automatically close on error
        clientSocket.on('error', (err) => {
            // rethrow if unexpected error
            if (!err.message.includes('ECONNREFUSED')) {
                throw err;
            }
            // No other server listening
            try {
                ServerWsConnection_simulator_1.staticLogger.trace(`cleaning unused socket: ${config}`);
                fs_1.default.unlinkSync(config);
            }
            catch (unlinkErr) {
                // ignore error if somehow file was already removed
                if (unlinkErr.code !== 'ENOENT') {
                    throw unlinkErr;
                }
            }
            // retry listening
            httpServer.listen(config);
        });
        clientSocket.once('connect', () => {
            // bad news if we are able to connect
            ServerWsConnection_simulator_1.staticLogger.error(`Another server already running on socket: ${config}`);
            process.exit(1);
        });
        clientSocket.connect({ path: config });
    });
}
async function startHttpServer(config, privateKeyFileName = undefined, certFileName = undefined) {
    let httpServer;
    if (privateKeyFileName && certFileName) {
        const opts = {
            key: fs_1.default.readFileSync(privateKeyFileName),
            cert: fs_1.default.readFileSync(certFileName)
        };
        httpServer = https_1.default.createServer(opts);
    }
    else if (privateKeyFileName === undefined && certFileName === undefined) {
        httpServer = http_1.default.createServer();
    }
    else {
        throw new Error('must supply both privateKeyFileName and certFileName or neither');
    }
    // clean up Unix Socket
    if (typeof config === 'string') {
        cleanSocket(httpServer, config);
    }
    try {
        httpServer.listen(config);
        await (0, events_1.once)(httpServer, 'listening');
        ServerWsConnection_simulator_1.staticLogger.info(`listening on ${JSON.stringify(config)}`);
    }
    catch (err) {
        // Kill process if started on host/port, else wait for Unix Socket to be cleaned up
        if (typeof config !== "string") {
            ServerWsConnection_simulator_1.staticLogger.error(err);
            process.exit(1);
        }
        else {
            await (0, events_1.once)(httpServer, 'listening');
            ServerWsConnection_simulator_1.staticLogger.info(`listening on ${JSON.stringify(config)}`);
        }
    }
    return httpServer;
}
exports.startHttpServer = startHttpServer;
//# sourceMappingURL=ServerWsEndpoint_simulator.js.map