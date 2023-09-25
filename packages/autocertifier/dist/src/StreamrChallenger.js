"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StreamrChallenger = void 0;
const dht_1 = require("@streamr/dht");
const RoutingRpcCommunicator_1 = require("@streamr/dht/dist/src/transport/RoutingRpcCommunicator");
const proto_rpc_1 = require("@streamr/proto-rpc");
const AutoCertifier_client_1 = require("./proto/packages/autocertifier/protos/AutoCertifier.client");
const utils_1 = require("@streamr/utils");
const IConnection_1 = require("@streamr/dht/dist/src/connection/IConnection");
const logger = new utils_1.Logger(module);
class StreamrChallenger {
    constructor() {
        this.SERVICE_ID = 'AutoCertifier';
        this.protocolVersion = '1.0';
        this.ownPeerDescriptor = {
            kademliaId: dht_1.PeerID.fromString('AutoCertifierServer').value,
            type: dht_1.NodeType.NODEJS,
        };
    }
    testStreamrChallenge(streamrWebSocketIp, streamrWebSocketPort, sessionId, _caCert) {
        return new Promise((resolve, reject) => {
            const targetPeerDescriptor = {
                kademliaId: dht_1.PeerID.fromString('AutoCertifierClient').value,
                type: dht_1.NodeType.NODEJS,
                websocket: {
                    ip: streamrWebSocketIp,
                    port: parseInt(streamrWebSocketPort)
                }
            };
            const socket = new dht_1.ClientWebSocket();
            const address = 'ws://' + targetPeerDescriptor.websocket.ip + ':' +
                targetPeerDescriptor.websocket.port;
            const managedConnection = new dht_1.ManagedConnection(this.ownPeerDescriptor, this.protocolVersion, IConnection_1.ConnectionType.WEBSOCKET_CLIENT, socket, undefined);
            managedConnection.setPeerDescriptor(targetPeerDescriptor);
            const onDisconnected = () => {
                reject(new Error('disconnected'));
            };
            socket.on('disconnected', onDisconnected);
            managedConnection.on('handshakeCompleted', () => {
                socket.off('disconnected', onDisconnected);
                const communicator = new RoutingRpcCommunicator_1.RoutingRpcCommunicator(this.SERVICE_ID, (msg, doNotConnect) => {
                    logger.info('sending message to peer');
                    return managedConnection.send(dht_1.Message.toBinary(msg), true);
                });
                managedConnection.on('managedData', (msg) => {
                    communicator.handleMessageFromPeer(dht_1.Message.fromBinary(msg));
                });
                const rpcClient = (0, proto_rpc_1.toProtoRpcClient)(new AutoCertifier_client_1.AutoCertifierServiceClient(communicator.getRpcClientTransport()));
                rpcClient.getSessionId({ sessionId: sessionId }).then(() => {
                    resolve();
                }).catch((e) => {
                    reject(e);
                });
            });
            socket.connect(address);
        });
    }
}
exports.StreamrChallenger = StreamrChallenger;
//# sourceMappingURL=StreamrChallenger.js.map