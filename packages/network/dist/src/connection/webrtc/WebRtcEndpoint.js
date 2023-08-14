"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebRtcEndpoint = void 0;
const events_1 = require("events");
const IWebRtcEndpoint_1 = require("./IWebRtcEndpoint");
const utils_1 = require("@streamr/utils");
const PeerInfo_1 = require("../PeerInfo");
const DeferredConnectionAttempt_1 = require("./DeferredConnectionAttempt");
const WebRtcConnection_1 = require("./WebRtcConnection");
const utils_2 = require("@streamr/utils");
const MessageQueue_1 = require("../MessageQueue");
const NameDirectory_1 = require("../../NameDirectory");
const uuid_1 = require("uuid");
const AddressTools_1 = require("../../helpers/AddressTools");
class WebRtcError extends Error {
}
const logger = new utils_1.Logger(module);
class WebRtcEndpoint extends events_1.EventEmitter {
    constructor(peerInfo, iceServers, rtcSignaller, metricsContext, negotiatedProtocolVersions, connectionFactory, newConnectionTimeout, pingInterval, webrtcDatachannelBufferThresholdLow, webrtcDatachannelBufferThresholdHigh, webrtcSendBufferMaxMessageCount, webrtcDisallowPrivateAddresses, portRange, maxMessageSize, externalIp) {
        super();
        this.stopped = false;
        this.peerInfo = peerInfo;
        this.iceServers = iceServers;
        this.rtcSignaller = rtcSignaller;
        this.negotiatedProtocolVersions = negotiatedProtocolVersions;
        this.connectionFactory = connectionFactory;
        this.connections = {};
        this.messageQueues = {};
        this.newConnectionTimeout = newConnectionTimeout;
        this.pingInterval = pingInterval;
        this.bufferThresholdLow = webrtcDatachannelBufferThresholdLow;
        this.bufferThresholdHigh = webrtcDatachannelBufferThresholdHigh;
        this.sendBufferMaxMessageCount = webrtcSendBufferMaxMessageCount;
        this.disallowPrivateAddresses = webrtcDisallowPrivateAddresses;
        this.maxMessageSize = maxMessageSize;
        this.portRange = portRange;
        this.externalIp = externalIp;
        this.connectionFactory.registerWebRtcEndpoint();
        rtcSignaller.setOfferListener(async (options) => {
            this.onRtcOfferFromSignaller(options);
        });
        rtcSignaller.setAnswerListener((options) => {
            this.onRtcAnswerFromSignaller(options);
        });
        rtcSignaller.setIceCandidateListener((options) => {
            this.onIceCandidateFromSignaller(options);
        });
        rtcSignaller.setConnectListener(async (options) => {
            this.onConnectFromSignaller(options);
        });
        rtcSignaller.setErrorListener((options) => {
            this.onErrorFromSignaller(options);
        });
        this.metrics = {
            sendMessagesPerSecond: new utils_2.RateMetric(),
            sendBytesPerSecond: new utils_2.RateMetric(),
            receiveMessagesPerSecond: new utils_2.RateMetric(),
            receiveBytesPerSecond: new utils_2.RateMetric(),
            connectionAverageCount: new utils_2.LevelMetric(0),
            connectionTotalFailureCount: new utils_2.CountMetric()
        };
        metricsContext.addMetrics('node', this.metrics);
        this.startConnectionStatusReport();
    }
    startConnectionStatusReport() {
        const getPeerNameList = (peerIds) => {
            return peerIds.map((peerId) => NameDirectory_1.NameDirectory.getName(peerId)).join(',');
        };
        const STATUS_REPORT_INTERVAL_MS = 5 * 60 * 1000;
        this.statusReportTimer = setInterval(() => {
            const connectedPeerIds = [];
            const pendingPeerIds = [];
            const undefinedStates = [];
            const connections = Object.keys(this.connections);
            for (const peerId of connections) {
                const lastState = this.connections[peerId].getLastState();
                if (lastState === 'connected') {
                    connectedPeerIds.push(peerId);
                }
                else if (lastState === 'connecting') {
                    pendingPeerIds.push(peerId);
                }
                else if (lastState === undefined) {
                    undefinedStates.push(peerId);
                }
            }
            if (connections.length > 0 && connections.length === undefinedStates.length) {
                logger.warn('Failed to determine WebRTC datachannel connection states');
            }
            else {
                const suffix = (pendingPeerIds.length > 0) ? ` (trying to connect to ${pendingPeerIds.length} peers)` : '';
                logger.info(`Connected to ${connectedPeerIds.length} peers${suffix}`);
                logger.debug(`Connected to peers: ${getPeerNameList(connectedPeerIds) || '[]'}`);
                logger.debug(`Connect to peers (pending): ${getPeerNameList(pendingPeerIds) || '[]'}`);
            }
        }, STATUS_REPORT_INTERVAL_MS);
    }
    createConnection(targetPeerId, routerId, deferredConnectionAttempt) {
        const messageQueue = this.messageQueues[targetPeerId] = this.messageQueues[targetPeerId] || new MessageQueue_1.MessageQueue(this.sendBufferMaxMessageCount);
        const connectionOptions = {
            selfId: this.peerInfo.peerId,
            targetPeerId,
            routerId,
            iceServers: this.iceServers,
            bufferThresholdHigh: this.bufferThresholdHigh,
            bufferThresholdLow: this.bufferThresholdLow,
            messageQueue,
            deferredConnectionAttempt: deferredConnectionAttempt || new DeferredConnectionAttempt_1.DeferredConnectionAttempt(),
            newConnectionTimeout: this.newConnectionTimeout,
            pingInterval: this.pingInterval,
            portRange: this.portRange,
            maxMessageSize: this.maxMessageSize,
            externalIp: this.externalIp
        };
        const connection = this.connectionFactory.createConnection(connectionOptions);
        if (connection.isOffering()) {
            connection.once('localDescription', (_type, description) => {
                this.rtcSignaller.sendRtcOffer(routerId, connection.getPeerId(), connection.getConnectionId(), description);
                this.attemptProtocolVersionValidation(connection);
            });
        }
        else {
            connection.once('localDescription', (_type, description) => {
                this.rtcSignaller.sendRtcAnswer(routerId, connection.getPeerId(), connection.getConnectionId(), description);
                this.attemptProtocolVersionValidation(connection);
            });
        }
        connection.on('localCandidate', (candidate, mid) => {
            this.rtcSignaller.sendRtcIceCandidate(routerId, connection.getPeerId(), connection.getConnectionId(), candidate, mid);
        });
        connection.once('open', () => {
            this.emit(IWebRtcEndpoint_1.Event.PEER_CONNECTED, connection.getPeerInfo());
        });
        connection.on('message', (message) => {
            this.emit(IWebRtcEndpoint_1.Event.MESSAGE_RECEIVED, connection.getPeerInfo(), message);
            this.metrics.receiveMessagesPerSecond.record(1);
            this.metrics.receiveBytesPerSecond.record(message.length);
        });
        connection.once('close', () => {
            if (this.connections[targetPeerId] === connection) {
                // if endpoint.close() was called, connection has already been
                // removed and possibly replaced. This check avoids deleting new
                // connection.
                delete this.connections[targetPeerId];
                this.onConnectionCountChange();
            }
            this.negotiatedProtocolVersions.removeNegotiatedProtocolVersion(targetPeerId);
            this.emit(IWebRtcEndpoint_1.Event.PEER_DISCONNECTED, connection.getPeerInfo());
            connection.removeAllListeners();
        });
        connection.on('bufferLow', () => {
            this.emit(IWebRtcEndpoint_1.Event.LOW_BACK_PRESSURE, connection.getPeerInfo());
        });
        connection.on('bufferHigh', () => {
            this.emit(IWebRtcEndpoint_1.Event.HIGH_BACK_PRESSURE, connection.getPeerInfo());
        });
        connection.on('failed', () => {
            this.metrics.connectionTotalFailureCount.record(1);
        });
        return connection;
    }
    onRtcOfferFromSignaller({ routerId, originatorInfo, description, connectionId }) {
        const { peerId } = originatorInfo;
        let connection;
        if (!this.connections[peerId]) {
            connection = this.createConnection(peerId, routerId, null);
            try {
                connection.connect();
            }
            catch (e) {
                logger.warn('Failed to connect (onRtcOfferFromSignaller)', e);
            }
            this.connections[peerId] = connection;
            this.onConnectionCountChange();
        }
        else if (this.connections[peerId].getConnectionId() !== 'none') {
            connection = this.replaceConnection(peerId, routerId);
        }
        else {
            connection = this.connections[peerId];
        }
        connection.setPeerInfo(PeerInfo_1.PeerInfo.fromObject(originatorInfo));
        connection.setConnectionId(connectionId);
        connection.setRemoteDescription(description, 'offer');
    }
    onRtcAnswerFromSignaller({ originatorInfo, description, connectionId }) {
        const { peerId } = originatorInfo;
        const connection = this.connections[peerId];
        if (!connection) {
            logger.debug('Received unexpected rtcAnswer', { peerId, description });
        }
        else if (connection.getConnectionId() !== connectionId) {
            logger.debug('Received unexpected rtcAnswer (connectionId mismatch)', {
                peerId,
                currentConnectionId: connection.getConnectionId(),
                sentConnectionId: connectionId
            });
        }
        else {
            connection.setPeerInfo(PeerInfo_1.PeerInfo.fromObject(originatorInfo));
            connection.setRemoteDescription(description, 'answer');
            this.attemptProtocolVersionValidation(connection);
        }
    }
    isIceCandidateAllowed(candidate) {
        if (this.disallowPrivateAddresses) {
            const address = (0, AddressTools_1.getAddressFromIceCandidate)(candidate);
            if (address && (0, AddressTools_1.isPrivateIPv4)(address)) {
                return false;
            }
        }
        return true;
    }
    onIceCandidateFromSignaller({ originatorInfo, candidate, mid, connectionId }) {
        const { peerId } = originatorInfo;
        const connection = this.connections[peerId];
        if (!connection) {
            logger.debug('Received unexpected iceCandidate (no connection)', { peerId, candidate });
        }
        else if (connection.getConnectionId() !== connectionId) {
            logger.debug('Received unexpected iceCandidate (connectionId mismatch)', {
                peerId,
                currentConnectionId: connection.getConnectionId(),
                sentConnectionId: connectionId
            });
        }
        else {
            if (this.isIceCandidateAllowed(candidate)) {
                connection.addRemoteCandidate(candidate, mid);
            }
        }
    }
    onErrorFromSignaller({ targetNode, errorCode }) {
        const error = new WebRtcError(`RTC error ${errorCode} while attempting to signal with node ${targetNode}`);
        const connection = this.connections[targetNode];
        // treat rtcSignaller errors as connection errors.
        if (connection) {
            connection.close(error);
        }
    }
    onConnectFromSignaller({ originatorInfo, routerId }) {
        const { peerId } = originatorInfo;
        if (this.connections[peerId]) {
            this.replaceConnection(peerId, routerId, (0, uuid_1.v4)());
        }
        else {
            this.connect(peerId, routerId, true).then(() => {
                logger.trace('Failed to connect (unattended connectListener induced connection)', { peerId });
                return peerId;
            }).catch((err) => {
                logger.trace('Failed to connect (connectListener induced connection)', { peerId, err });
            });
        }
    }
    replaceConnection(peerId, routerId, newConnectionId) {
        // Close old connection
        const conn = this.connections[peerId];
        let deferredConnectionAttempt = null;
        if (conn.getDeferredConnectionAttempt()) {
            deferredConnectionAttempt = conn.stealDeferredConnectionAttempt();
        }
        delete this.connections[peerId];
        this.onConnectionCountChange();
        conn.close();
        // Set up new connection
        const connection = this.createConnection(peerId, routerId, deferredConnectionAttempt);
        if (newConnectionId) {
            connection.setConnectionId(newConnectionId);
        }
        try {
            connection.connect();
        }
        catch (e) {
            logger.warn('Failed to connect (replaceConnection)', e);
        }
        this.connections[peerId] = connection;
        this.onConnectionCountChange();
        return connection;
    }
    async connect(targetPeerId, routerId, trackerInstructed = true) {
        // Prevent new connections from being opened when WebRtcEndpoint has been closed
        if (this.stopped) {
            return Promise.reject(new WebRtcError('WebRtcEndpoint has been stopped'));
        }
        if (this.connections[targetPeerId]) {
            const connection = this.connections[targetPeerId];
            const lastState = connection.getLastState();
            const deferredConnectionAttempt = connection.getDeferredConnectionAttempt();
            logger.trace('Found pre-existing connection for peer', {
                role: (0, WebRtcConnection_1.isOffering)(this.peerInfo.peerId, targetPeerId) ? 'offerer' : 'answerer',
                targetPeerId: NameDirectory_1.NameDirectory.getName(targetPeerId),
                state: lastState
            });
            if (lastState === 'connected') {
                return Promise.resolve(targetPeerId);
            }
            else if (deferredConnectionAttempt) {
                return deferredConnectionAttempt.getPromise();
            }
            else {
                throw new Error(`unexpected deferedConnectionAttempt == null ${connection.getPeerId()}`);
            }
        }
        const connection = this.createConnection(targetPeerId, routerId, null);
        if (connection.isOffering()) {
            connection.setConnectionId((0, uuid_1.v4)());
        }
        this.connections[targetPeerId] = connection;
        this.onConnectionCountChange();
        connection.connect();
        if (!trackerInstructed && !connection.isOffering()) {
            // If we are non-offerer and this connection was not instructed by the tracker, we need
            // to let the offering side know about it so it can send us the initial offer message.
            this.rtcSignaller.sendRtcConnect(routerId, connection.getPeerId());
        }
        const deferredAttempt = connection.getDeferredConnectionAttempt();
        if (connection.getLastState() == 'connected') {
            return targetPeerId;
        }
        if (deferredAttempt) {
            return deferredAttempt.getPromise();
        }
        else {
            throw new WebRtcError(`disconnected ${connection.getPeerId()}`);
        }
    }
    async send(targetPeerId, message) {
        if (!this.connections[targetPeerId]) {
            throw new WebRtcError(`Not connected to ${targetPeerId}.`);
        }
        await this.connections[targetPeerId].send(message);
        this.metrics.sendMessagesPerSecond.record(1);
        this.metrics.sendBytesPerSecond.record(message.length);
    }
    attemptProtocolVersionValidation(connection) {
        try {
            this.negotiatedProtocolVersions.negotiateProtocolVersion(connection.getPeerId(), connection.getPeerInfo().controlLayerVersions, connection.getPeerInfo().messageLayerVersions);
        }
        catch (err) {
            logger.debug('Encountered error while negotiating protocol versions', err);
            this.close(connection.getPeerId(), `No shared protocol versions with node: ${connection.getPeerId()}`);
        }
    }
    close(receiverPeerId, reason) {
        const connection = this.connections[receiverPeerId];
        if (connection) {
            logger.debug('Close connection', { peerId: NameDirectory_1.NameDirectory.getName(receiverPeerId), reason });
            delete this.connections[receiverPeerId];
            this.onConnectionCountChange();
            connection.close();
        }
    }
    getRtts() {
        const rtts = {};
        Object.entries(this.connections).forEach(([targetPeerId, connection]) => {
            const rtt = connection.getRtt();
            if (rtt !== undefined && rtt !== null) {
                rtts[targetPeerId] = rtt;
            }
        });
        return rtts;
    }
    getPeerInfo() {
        return this.peerInfo;
    }
    getNegotiatedMessageLayerProtocolVersionOnNode(peerId) {
        return this.negotiatedProtocolVersions.getNegotiatedProtocolVersions(peerId)?.messageLayerVersion;
    }
    getNegotiatedControlLayerProtocolVersionOnNode(peerId) {
        return this.negotiatedProtocolVersions.getNegotiatedProtocolVersions(peerId)?.controlLayerVersion;
    }
    getDefaultMessageLayerProtocolVersion() {
        return this.negotiatedProtocolVersions.getDefaultProtocolVersions().messageLayerVersion;
    }
    getDefaultControlLayerProtocolVersion() {
        return this.negotiatedProtocolVersions.getDefaultProtocolVersions().controlLayerVersion;
    }
    /**
     * @deprecated
     */
    getAddress() {
        return this.peerInfo.peerId;
    }
    stop() {
        if (this.stopped === true) {
            throw new Error('already stopped');
        }
        this.stopped = true;
        const { connections, messageQueues } = this;
        this.connections = {};
        this.onConnectionCountChange();
        this.messageQueues = {};
        this.rtcSignaller.setOfferListener(() => { });
        this.rtcSignaller.setAnswerListener(() => { });
        this.rtcSignaller.setIceCandidateListener(() => { });
        this.rtcSignaller.setErrorListener(() => { });
        this.rtcSignaller.setConnectListener(() => { });
        clearInterval(this.statusReportTimer);
        this.removeAllListeners();
        Object.values(connections).forEach((connection) => connection.close());
        Object.values(messageQueues).forEach((queue) => queue.clear());
        this.connectionFactory.unregisterWebRtcEndpoint();
    }
    getAllConnectionNodeIds() {
        return Object.keys(this.connections);
    }
    getDiagnosticInfo() {
        return {
            connections: Object.values(this.connections).map((c) => c.getDiagnosticInfo())
        };
    }
    onConnectionCountChange() {
        this.metrics.connectionAverageCount.record(Object.keys(this.connections).length);
    }
}
exports.WebRtcEndpoint = WebRtcEndpoint;
//# sourceMappingURL=WebRtcEndpoint.js.map