"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NodeWebRtcConnection = exports.webRtcConnectionFactory = void 0;
const events_1 = require("events");
const node_datachannel_1 = __importDefault(require("node-datachannel"));
const WebRtcConnection_1 = require("./WebRtcConnection");
const utils_1 = require("@streamr/utils");
const NameDirectory_1 = require("../../NameDirectory");
const iceServerAsString_1 = require("./iceServerAsString");
const ParsedLocalCandidate_1 = require("./ParsedLocalCandidate");
const loggerLevel = process.env.NODE_DATACHANNEL_LOG_LEVEL || 'Fatal';
node_datachannel_1.default.initLogger(loggerLevel);
/**
 * Create an EventEmitter that fires appropriate events for
 * each peerConnection.onEvent handler.
 *
 * Wrapping allows us to trivially clear all event handlers.
 * There's no way to reliably stop PeerConnection from running an event handler
 * after you've passed it. Closing a connection doesn't prevent handlers from firing.
 * Replacing handlers with noops doesn't work reliably, it can still fire the old handlers.
 */
function PeerConnectionEmitter(connection) {
    const emitter = new events_1.EventEmitter();
    emitter.on('error', () => { }); // noop to prevent unhandled error event
    connection.onStateChange((...args) => emitter.emit('stateChange', ...args));
    connection.onGatheringStateChange((...args) => (emitter.emit('gatheringStateChange', ...args)));
    connection.onLocalDescription((...args) => emitter.emit('localDescription', ...args));
    connection.onLocalCandidate((...args) => emitter.emit('localCandidate', ...args));
    connection.onDataChannel((...args) => emitter.emit('dataChannel', ...args));
    return emitter;
}
function DataChannelEmitter(dataChannel) {
    const emitter = new events_1.EventEmitter();
    emitter.on('error', () => { }); // noop to prevent unhandled error event
    dataChannel.onOpen((...args) => emitter.emit('open', ...args));
    dataChannel.onClosed((...args) => emitter.emit('closed', ...args));
    dataChannel.onError((...args) => emitter.emit('error', ...args));
    dataChannel.onBufferedAmountLow((...args) => emitter.emit('bufferedAmountLow', ...args));
    dataChannel.onMessage((...args) => emitter.emit('message', ...args));
    return emitter;
}
exports.webRtcConnectionFactory = new class {
    constructor() {
        this.activeWebRtcEndpointCount = 0;
        this.logger = new utils_1.Logger(module);
    }
    // eslint-disable-next-line class-methods-use-this
    createConnection(opts) {
        return new NodeWebRtcConnection(opts);
    }
    registerWebRtcEndpoint() {
        this.activeWebRtcEndpointCount++;
    }
    unregisterWebRtcEndpoint() {
        this.activeWebRtcEndpointCount--;
        if (this.activeWebRtcEndpointCount === 0) {
            this.logger.debug('Clean up nodeDataChannel library');
            node_datachannel_1.default.cleanup();
        }
    }
};
class NodeWebRtcConnection extends WebRtcConnection_1.WebRtcConnection {
    constructor(opts) {
        super(opts);
        this.remoteDescriptionSet = false;
        this.logger = new utils_1.Logger(module, { id: `${NameDirectory_1.NameDirectory.getName(this.getPeerId())}/${this.id}` });
        this.connection = null;
        this.dataChannel = null;
        this.onStateChange = this.onStateChange.bind(this);
        this.onLocalCandidate = this.onLocalCandidate.bind(this);
        this.onLocalDescription = this.onLocalDescription.bind(this);
        this.onGatheringStateChange = this.onGatheringStateChange.bind(this);
        this.onDataChannel = this.onDataChannel.bind(this);
    }
    doSendMessage(message) {
        this.dataChannel.sendMessage(message);
    }
    doConnect() {
        this.connection = new node_datachannel_1.default.PeerConnection(this.selfId, {
            iceServers: this.iceServers.map(iceServerAsString_1.iceServerAsString),
            maxMessageSize: this.maxMessageSize,
            portRangeBegin: this.portRange.min,
            portRangeEnd: this.portRange.max
        });
        this.connectionEmitter = PeerConnectionEmitter(this.connection);
        this.connectionEmitter.on('stateChange', this.onStateChange);
        this.connectionEmitter.on('gatheringStateChange', this.onGatheringStateChange);
        this.connectionEmitter.on('localDescription', this.onLocalDescription);
        this.connectionEmitter.on('localCandidate', this.onLocalCandidate);
        if (this.isOffering()) {
            const dataChannel = this.connection.createDataChannel('streamrDataChannel');
            this.setupDataChannel(dataChannel);
        }
        else {
            this.connectionEmitter.on('dataChannel', this.onDataChannel);
        }
    }
    setRemoteDescription(description, type) {
        if (this.connection) {
            try {
                this.connection.setRemoteDescription(description, type);
                this.remoteDescriptionSet = true;
            }
            catch (err) {
                this.logger.warn('Failed to set remote description', err);
            }
        }
        else {
            this.logger.warn('Skipped setting remote description (connection is null)');
        }
    }
    addRemoteCandidate(candidate, mid) {
        if (this.connection) {
            if (this.remoteDescriptionSet) {
                try {
                    this.connection.addRemoteCandidate(candidate, mid);
                }
                catch (err) {
                    this.logger.warn('Failed to add remote candidate', err);
                    this.close(new Error('addRemoteCandidate failed'));
                }
            }
            else {
                this.logger.warn("Close connection (tried setting remote candidate before remote description)");
                this.close(new Error('Tried setting remoteCandidate before remote description'));
            }
        }
        else {
            this.logger.warn('Skipped adding remote candidate (connection is null)');
        }
    }
    doClose(_err) {
        if (this.connectionEmitter) {
            this.connectionEmitter.removeAllListeners();
        }
        if (this.dataChannelEmitter) {
            this.dataChannelEmitter.removeAllListeners();
        }
        if (this.connection) {
            try {
                this.connection.close();
            }
            catch (e) {
                this.logger.warn('Encountered error while closing connection', e);
            }
        }
        if (this.dataChannel) {
            try {
                this.dataChannel.close();
            }
            catch (e) {
                this.logger.warn('Encountered error while closing dataChannel', e);
            }
        }
        this.dataChannel = null;
        this.connection = null;
        this.lastState = undefined;
        this.lastGatheringState = undefined;
    }
    getBufferedAmount() {
        try {
            return this.dataChannel.bufferedAmount().valueOf();
        }
        catch (err) {
            return 0;
        }
    }
    getMaxMessageSize() {
        try {
            return this.dataChannel.maxMessageSize().valueOf();
        }
        catch (err) {
            return 1024 * 1024;
        }
    }
    isOpen() {
        try {
            return this.dataChannel.isOpen();
        }
        catch (err) {
            return false;
        }
    }
    getLastState() {
        return this.lastState;
    }
    getLastGatheringState() {
        return this.lastGatheringState;
    }
    onStateChange(state) {
        this.logger.trace('onStateChange', {
            lastState: this.lastState,
            state
        });
        this.lastState = state;
        if (state === 'disconnected' || state === 'closed') {
            this.close();
        }
        else if (state === 'failed') {
            this.close(new Error('connection failed'));
        }
        else if (state === 'connecting') {
            this.restartConnectionTimeout();
        }
    }
    onGatheringStateChange(state) {
        this.logger.trace('onGatheringStateChange', {
            lastState: this.lastGatheringState,
            state
        });
        this.lastGatheringState = state;
    }
    onDataChannel(dataChannel) {
        this.setupDataChannel(dataChannel);
        this.logger.trace('connection.onDataChannel');
        this.openDataChannel(dataChannel);
    }
    onLocalDescription(description, type) {
        this.emitLocalDescription(description, type);
    }
    onLocalCandidate(candidate, mid) {
        this.logger.trace(`onLocalCandidate ${candidate} ${mid}`);
        const parsedCandidate = new ParsedLocalCandidate_1.ParsedLocalCandidate(candidate);
        if (this.externalIp && parsedCandidate.getType() === ParsedLocalCandidate_1.CandidateType.HOST) {
            parsedCandidate.setIp(this.externalIp);
            const injectedCandidate = parsedCandidate.toString();
            this.logger.trace(`onLocalCandidate injected external ip ${injectedCandidate} ${mid}`);
            this.emitLocalCandidate(injectedCandidate, mid);
        }
        else {
            this.emitLocalCandidate(candidate, mid);
        }
    }
    setupDataChannel(dataChannel) {
        this.dataChannelEmitter = DataChannelEmitter(dataChannel);
        dataChannel.setBufferedAmountLowThreshold(this.bufferThresholdLow);
        this.dataChannelEmitter.on('open', () => {
            this.logger.trace('dataChannelEmitter.onOpen');
            this.openDataChannel(dataChannel);
        });
        this.dataChannelEmitter.on('closed', () => {
            this.logger.trace('dataChannelEmitter.onClosed');
            this.close();
        });
        this.dataChannelEmitter.on('error', (err) => {
            this.logger.warn('Encountered error (emitted by dataChannelEmitter)', err);
        });
        this.dataChannelEmitter.on('bufferedAmountLow', () => {
            this.emitLowBackpressure();
        });
        this.dataChannelEmitter.on('message', (msg) => {
            this.logger.trace('dataChannelEmitter.onmessage');
            this.emitMessage(msg.toString());
        });
    }
    openDataChannel(dataChannel) {
        this.dataChannel = dataChannel;
        this.emitOpen();
    }
}
exports.NodeWebRtcConnection = NodeWebRtcConnection;
//# sourceMappingURL=NodeWebRtcConnection.js.map