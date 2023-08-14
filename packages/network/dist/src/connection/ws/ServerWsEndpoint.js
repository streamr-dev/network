"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startHttpServer = exports.ServerWsEndpoint = void 0;
const PeerInfo_1 = require("../PeerInfo");
const AbstractWsEndpoint_1 = require("./AbstractWsEndpoint");
const ServerWsConnection_1 = require("./ServerWsConnection");
const fs_1 = __importDefault(require("fs"));
const net_1 = __importDefault(require("net"));
const https_1 = __importDefault(require("https"));
const http_1 = __importDefault(require("http"));
const ws_1 = __importDefault(require("ws"));
const events_1 = require("events");
const uuid_1 = require("uuid");
const utils_1 = require("@streamr/utils");
const logger = new utils_1.Logger(module);
class ServerWsEndpoint extends AbstractWsEndpoint_1.AbstractWsEndpoint {
    constructor(listen, sslEnabled, httpServer, peerInfo, pingInterval) {
        super(peerInfo, pingInterval);
        this.httpServer = httpServer;
        const protocol = sslEnabled ? 'wss' : 'ws';
        if (typeof listen !== "string") {
            this.serverUrl = `${protocol}://${listen.hostname}:${listen.port}`;
        }
        else {
            this.serverUrl = `${protocol}+unix://${listen}`;
        }
        this.wss = this.startWsServer();
    }
    startWsServer() {
        return new ws_1.default.Server({
            server: this.httpServer,
            maxPayload: 1024 * 1024
        }).on('error', (err) => {
            logger.error('Encountered error (emitted by WebSocket.Server)', { err });
        }).on('listening', () => {
            logger.trace('Started', { url: this.getUrl() });
        }).on('connection', (ws, request) => {
            const handshakeUUID = (0, uuid_1.v4)();
            this.handshakeTimeoutRefs[handshakeUUID] = setTimeout(() => {
                ws.close(AbstractWsEndpoint_1.DisconnectionCode.FAILED_HANDSHAKE, `Handshake not received from connection behind UUID ${handshakeUUID}`);
                logger.warn('Timed out waiting for handshake from connection', { handshakeUUID });
                ws.terminate();
                delete this.handshakeTimeoutRefs[handshakeUUID];
            }, this.handshakeTimer);
            ws.send(JSON.stringify({ uuid: handshakeUUID, peerId: this.peerInfo.peerId }));
            const duplexStream = ws_1.default.createWebSocketStream(ws, {
                decodeStrings: false
            });
            let otherNodeIdForLogging = 'unknown (no handshake)';
            duplexStream.on('data', async (data) => {
                try {
                    const { uuid, peerId } = JSON.parse(data.toString());
                    if (uuid === handshakeUUID && peerId) {
                        otherNodeIdForLogging = peerId;
                        this.clearHandshake(uuid);
                        // Check that a client with the same peerId has not already connected to the server.
                        if (!this.getConnectionByPeerId(peerId)) {
                            this.acceptConnection(ws, duplexStream, peerId, this.resolveIP(request));
                        }
                        else {
                            const failedMessage = `Connection for node: ${peerId} has already been established, rejecting duplicate`;
                            ws.close(AbstractWsEndpoint_1.DisconnectionCode.DUPLICATE_SOCKET, failedMessage);
                            logger.warn('Reject duplicate connection (connection to peer has already been established)', {
                                peerId
                            });
                        }
                    }
                    else {
                        logger.trace('Received unexpected message (expected handshake message)', { message: data.toString() });
                    }
                }
                catch (err) {
                    logger.trace('startWsServer', { err });
                }
            });
            ws.on('error', (err) => {
                logger.warn('Encountered error (emitted by socket)', { otherNodeIdForLogging, err });
            });
        });
    }
    acceptConnection(ws, duplexStream, peerId, remoteAddress) {
        const connection = new ServerWsConnection_1.ServerWsConnection(ws, duplexStream, remoteAddress, PeerInfo_1.PeerInfo.newNode(peerId));
        duplexStream.on('data', async (data) => {
            const parsed = data.toString();
            if (parsed === 'ping') {
                await this.send(peerId, 'pong');
            }
            else {
                this.onReceive(connection, data.toString());
            }
        });
        duplexStream.on('drain', () => {
            connection.evaluateBackPressure();
        });
        duplexStream.on('error', (error) => {
            logger.error('Encountered error (emitted by DuplexStream)', { stack: error.stack });
        });
        ws.on('pong', () => {
            connection.onPong();
        });
        ws.on('close', (code, reason) => {
            this.onClose(connection, code, reason.toString());
        });
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
        return new Promise((resolve, reject) => {
            for (const ws of this.wss.clients) {
                ws.terminate();
            }
            this.wss.close((err) => {
                if (err) {
                    logger.error('Encountered error (while closing WebSocket.Server)', { err });
                }
                this.httpServer.close((err) => {
                    if (err) {
                        logger.error('Encountered error (while closing httpServer)', { err });
                        reject(err);
                    }
                    else {
                        resolve();
                    }
                });
            });
        });
    }
    // eslint-disable-next-line class-methods-use-this
    resolveIP(request) {
        // Accept X-Forwarded-For header on connections from the local machine
        if (request.socket.remoteAddress?.endsWith('127.0.0.1')) {
            return (request.headers['x-forwarded-for'] || request.socket.remoteAddress);
        }
        return request.socket.remoteAddress;
    }
}
exports.ServerWsEndpoint = ServerWsEndpoint;
function cleanSocket(httpServer, config) {
    httpServer.on('error', (err) => {
        // rethrow if unexpected error
        if (!err.message.includes('EADDRINUSE')) {
            throw err;
        }
        logger.info('Try to recover used socket', { config });
        const clientSocket = new net_1.default.Socket();
        // socket will automatically close on error
        clientSocket.on('error', (err) => {
            // rethrow if unexpected error
            if (!err.message.includes('ECONNREFUSED')) {
                throw err;
            }
            // No other server listening
            try {
                logger.trace('Clean unused socket', { config });
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
            logger.error('Encountered unexpected reserved socket (another server already running?)', { config });
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
        logger.info('Listen', { details: JSON.stringify(config) });
    }
    catch (err) {
        // Kill process if started on host/port, else wait for Unix Socket to be cleaned up
        if (typeof config !== "string") {
            logger.error('Failed to start httpServer', err);
            process.exit(1);
        }
        else {
            await (0, events_1.once)(httpServer, 'listening');
            logger.info('Listen', { details: JSON.stringify(config) });
        }
    }
    return httpServer;
}
exports.startHttpServer = startHttpServer;
//# sourceMappingURL=ServerWsEndpoint.js.map