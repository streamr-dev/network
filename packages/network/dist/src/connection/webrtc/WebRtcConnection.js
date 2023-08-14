"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebRtcConnection = exports.isOffering = exports.ConnectionEmitter = void 0;
const events_1 = require("events");
const utils_1 = require("@streamr/utils");
const PeerInfo_1 = require("../PeerInfo");
const MessageQueue_1 = require("../MessageQueue");
const NameDirectory_1 = require("../../NameDirectory");
const crypto_1 = __importDefault(require("crypto"));
let ID = 0;
// reminder: only use Connection emitter for external handlers
// to make it safe for consumers to call removeAllListeners
// i.e. no this.on('event')
// eslint-disable-next-line @typescript-eslint/prefer-function-type
exports.ConnectionEmitter = events_1.EventEmitter;
function isOffering(myId, theirId) {
    return offeringHash(myId + theirId) < offeringHash(theirId + myId);
}
exports.isOffering = isOffering;
function offeringHash(idPair) {
    const buffer = crypto_1.default.createHash('md5').update(idPair).digest();
    return buffer.readInt32LE(0);
}
/**
 * Shared base class for WebRTC connections implemented in different libraries.
 * Encapsulates the common needs of such connections such as:
 *
 *  - Determining offerer / answerer roles upon connecting
 *  - Connection timeout
 *  - Message queueing and retries on message delivery failures
 *  - Backpressure handling
 *  - Ping/Pong mechanism for RTT calculation and dead connection detection
 *  - Deferred promise handling in case of connection re-attempts
 *  - Closing of connection and associated clean up
 *  - Ensuring event loop isn't greedily reserved for long periods of time
 *
 *  Implementers of this base class should make sure to implement the
 *  abstract methods. Implementers should also make sure their base classes
 *  invoke all "emit"-prefixed protected methods:
 *  - emitOpen
 *  - emitLocalDescription
 *  - emitLocalCandidate
 *  - emitMessage
 *  - emitLowBackpressure
 *
 *  See the respective JSDocs for more information.
 *
 */
class WebRtcConnection extends exports.ConnectionEmitter {
    constructor({ selfId, targetPeerId, iceServers, messageQueue, deferredConnectionAttempt, pingInterval, portRange, maxMessageSize, externalIp, bufferThresholdHigh = 2 ** 17, bufferThresholdLow = 2 ** 15, newConnectionTimeout = 15000, maxPingPongAttempts = 5, flushRetryTimeout = 500 }) {
        super();
        this.connectionId = 'none';
        this.pingAttempts = 0;
        this.hasOpened = false;
        // diagnostic info
        this.messagesSent = 0;
        this.messagesRecv = 0;
        this.bytesSent = 0;
        this.bytesRecv = 0;
        this.sendFailures = 0;
        this.openSince = null;
        ID += 1;
        this.id = `Connection${ID}`;
        this.selfId = selfId;
        this.peerInfo = PeerInfo_1.PeerInfo.newUnknown(targetPeerId);
        this.iceServers = iceServers;
        this.bufferThresholdHigh = bufferThresholdHigh;
        this.bufferThresholdLow = bufferThresholdLow;
        this.maxMessageSize = maxMessageSize;
        this.newConnectionTimeout = newConnectionTimeout;
        this.maxPingPongAttempts = maxPingPongAttempts;
        this.pingInterval = pingInterval;
        this.flushRetryTimeout = flushRetryTimeout;
        this.messageQueue = messageQueue;
        this.deferredConnectionAttempt = deferredConnectionAttempt;
        this.externalIp = externalIp;
        this.portRange = portRange;
        this.baseLogger = new utils_1.Logger(module, { id: `${NameDirectory_1.NameDirectory.getName(this.getPeerId())}/${ID}` });
        this.isFinished = false;
        this.paused = false;
        this.flushTimeoutRef = null;
        this.connectionTimeoutRef = null;
        this.pingTimeoutRef = setTimeout(() => this.ping(), this.pingInterval);
        this.flushRef = null;
        this.rtt = null;
        this.rttStart = null;
        this.baseLogger.trace('Create', {
            selfId: this.selfId,
            messageQueue: this.messageQueue.size(),
            peerInfo: this.peerInfo,
        });
    }
    connect() {
        if (this.isFinished) {
            throw new Error('Connection already closed.');
        }
        this.connectionTimeoutRef = setTimeout(() => {
            if (this.isFinished) {
                return;
            }
            this.close(new Error(`timed out after ${this.newConnectionTimeout}ms`));
        }, this.newConnectionTimeout);
        this.doConnect();
    }
    getDeferredConnectionAttempt() {
        return this.deferredConnectionAttempt;
    }
    stealDeferredConnectionAttempt() {
        const att = this.deferredConnectionAttempt;
        this.deferredConnectionAttempt = null;
        return att;
    }
    close(err) {
        if (this.isFinished) {
            // already closed, noop
            return;
        }
        this.isFinished = true;
        if (err) {
            this.baseLogger.debug('Close connection', { err });
        }
        else {
            this.baseLogger.trace('close()');
        }
        if (this.flushRef) {
            clearImmediate(this.flushRef);
        }
        if (this.flushTimeoutRef) {
            clearTimeout(this.flushTimeoutRef);
        }
        if (this.connectionTimeoutRef) {
            clearTimeout(this.connectionTimeoutRef);
        }
        if (this.pingTimeoutRef) {
            clearTimeout(this.pingTimeoutRef);
        }
        this.flushTimeoutRef = null;
        this.connectionTimeoutRef = null;
        this.pingTimeoutRef = null;
        this.flushRef = null;
        try {
            this.doClose(err);
        }
        catch (e) {
            this.baseLogger.warn('Encountered error in doClose', e);
        }
        if (!this.hasOpened) {
            this.emit('failed');
        }
        if (err) {
            this.emitClose(err);
            return;
        }
        this.emitClose('closed');
    }
    emitClose(reason) {
        if (this.deferredConnectionAttempt) {
            const def = this.deferredConnectionAttempt;
            this.deferredConnectionAttempt = null;
            def.reject(reason);
        }
        this.openSince = null;
        this.emit('close');
    }
    getConnectionId() {
        return this.connectionId;
    }
    setConnectionId(id) {
        this.connectionId = id;
    }
    send(message) {
        this.setFlushRef();
        return this.messageQueue.add(message);
    }
    setPeerInfo(peerInfo) {
        this.peerInfo = peerInfo;
    }
    getPeerInfo() {
        return this.peerInfo;
    }
    getPeerId() {
        return this.peerInfo.peerId;
    }
    getRtt() {
        return this.rtt;
    }
    ping() {
        if (this.isFinished) {
            return;
        }
        if (this.isOpen()) {
            if (this.pingAttempts >= this.maxPingPongAttempts) {
                if (this.pingTimeoutRef) {
                    clearTimeout(this.pingTimeoutRef);
                    this.pingTimeoutRef = null;
                }
                this.baseLogger.debug('Close connection (failed to receive pong after ping attempts)', {
                    maxAttempts: this.maxPingPongAttempts
                });
                this.close(new Error('pong not received'));
                return;
            }
            else {
                this.rttStart = Date.now();
                try {
                    if (this.isOpen()) {
                        this.doSendMessage('ping');
                    }
                }
                catch (err) {
                    this.baseLogger.debug('Failed to send ping', {
                        peerId: this.peerInfo.peerId,
                        err
                    });
                }
                this.pingAttempts += 1;
            }
        }
        if (this.pingTimeoutRef) {
            clearTimeout(this.pingTimeoutRef);
            this.pingTimeoutRef = null;
        }
        this.pingTimeoutRef = setTimeout(() => this.ping(), this.pingInterval);
    }
    pong() {
        if (this.isFinished) {
            return;
        }
        try {
            if (this.isOpen()) {
                this.doSendMessage('pong');
            }
        }
        catch (err) {
            this.baseLogger.warn('Failed to send pong', {
                peerId: this.peerInfo.peerId,
                err
            });
        }
    }
    isOffering() {
        return isOffering(this.selfId, this.peerInfo.peerId);
    }
    getDiagnosticInfo() {
        return {
            connectionId: this.getConnectionId(),
            peerId: this.getPeerId(),
            rtt: this.getRtt(),
            ageInSec: this.openSince !== null ? Math.round((Date.now() - this.openSince) / 1000) : null,
            messageQueueLength: this.messageQueue.size(),
            bufferedAmount: this.getBufferedAmount(),
            messagesSent: this.messagesSent,
            messagesRecv: this.messagesRecv,
            bytesSend: this.bytesSent,
            bytesRecv: this.bytesRecv,
            sendFailures: this.sendFailures,
            open: this.isOpen(),
            paused: this.paused,
            finished: this.isFinished,
            pingAttempts: this.pingAttempts,
            isOffering: this.isOffering(),
            lastState: this.getLastState(),
            lastGatheringState: this.getLastGatheringState(),
        };
    }
    setFlushRef() {
        if (this.flushRef === null) {
            this.flushRef = setImmediate(() => {
                this.flushRef = null;
                this.attemptToFlushMessages();
            });
        }
    }
    attemptToFlushMessages() {
        let numOfSuccessSends = 0;
        while (!this.isFinished && !this.messageQueue.empty() && this.isOpen()) {
            // Max 10 messages sent in busy-loop, then relinquish control for a moment, in case `dc.send` is blocking
            // (is it?)
            if (numOfSuccessSends >= 10) {
                this.setFlushRef();
                return;
            }
            const queueItem = this.messageQueue.peek();
            if (queueItem.isFailed()) {
                this.baseLogger.debug('Encountered failed queue item', { queueItem, numOfSuccessSends });
                this.messageQueue.pop();
            }
            else if (queueItem.getMessage().length > this.getMaxMessageSize()) {
                const errorMessage = 'Dropping message due to size '
                    + queueItem.getMessage().length
                    + ' exceeding the limit of '
                    + this.getMaxMessageSize();
                queueItem.immediateFail(errorMessage);
                this.baseLogger.warn('Dropping message due to size', {
                    size: queueItem.getMessage().length,
                    limit: this.getMaxMessageSize()
                });
                this.messageQueue.pop();
            }
            else if (this.paused || this.getBufferedAmount() >= this.bufferThresholdHigh) {
                if (!this.paused) {
                    this.paused = true;
                    this.emit('bufferHigh');
                }
                return; // method eventually re-scheduled by `onBufferedAmountLow`
            }
            else {
                let sent;
                let caughtError = undefined;
                if (this.isOpen()) {
                    try {
                        this.doSendMessage(queueItem.getMessage());
                        // this.isOpen() is checked immediately after the call to node-datachannel.sendMessage() as if
                        // this.isOpen() returns false after a "successful" send, the message is lost with a near 100% chance.
                        // This does not work as expected if this.isOpen() is checked before sending a message
                        sent = this.isOpen();
                    }
                    catch (e) {
                        caughtError = e;
                        sent = false;
                    }
                }
                else {
                    sent = false;
                }
                if (sent) {
                    this.messageQueue.pop();
                    queueItem.delivered();
                    numOfSuccessSends += 1;
                    this.messagesSent += 1;
                    this.bytesSent += queueItem.getMessage().length;
                }
                else {
                    this.baseLogger.debug('Failed to send queue item', {
                        numOfSuccessSends,
                        queueItem,
                        messageQueueSize: this.messageQueue.size(),
                    });
                    this.sendFailures += 1;
                    this.processFailedMessage(queueItem, caughtError ?? new Error('failed to send message'));
                    return; // method rescheduled by `this.flushTimeoutRef`
                }
            }
        }
    }
    processFailedMessage(queueItem, e) {
        queueItem.incrementTries({
            error: e.toString(),
            'connection.iceConnectionState': this.getLastGatheringState(),
            'connection.connectionState': this.getLastState()
        });
        if (queueItem.isFailed()) {
            const infoText = queueItem.getErrorInfos().map((i) => JSON.stringify(i)).join('\n\t');
            this.baseLogger.warn('Discard message (all previous send attempts failed)', {
                maxTries: MessageQueue_1.MessageQueue.MAX_TRIES,
                infoText
            });
            this.messageQueue.pop();
        }
        if (this.flushTimeoutRef === null) {
            this.flushTimeoutRef = setTimeout(() => {
                this.flushTimeoutRef = null;
                this.attemptToFlushMessages();
            }, this.flushRetryTimeout);
        }
    }
    /**
     * Subclass should call this method when the connection has opened.
     */
    emitOpen() {
        if (this.connectionTimeoutRef !== null) {
            clearTimeout(this.connectionTimeoutRef);
        }
        if (this.deferredConnectionAttempt) {
            const def = this.deferredConnectionAttempt;
            this.deferredConnectionAttempt = null;
            def.resolve(this.peerInfo.peerId);
        }
        this.openSince = Date.now();
        this.hasOpened = true;
        this.setFlushRef();
        this.emit('open');
    }
    /**
     * Subclass should call this method when a new local description is available.
     */
    emitLocalDescription(description, type) {
        this.emit('localDescription', type, description);
    }
    /**
     * Subclass should call this method when a new local candidate is available.
     */
    emitLocalCandidate(candidate, mid) {
        this.emit('localCandidate', candidate, mid);
    }
    /**
     * Subclass should call this method when it has received a message.
     */
    emitMessage(msg) {
        if (msg === 'ping') {
            this.pong();
        }
        else if (msg === 'pong') {
            this.pingAttempts = 0;
            this.rtt = Date.now() - this.rttStart;
        }
        else {
            this.messagesRecv += 1;
            this.bytesRecv += msg.length;
            this.emit('message', msg);
        }
    }
    /**
     * Subclass should call this method when backpressure has reached low watermark.
     */
    emitLowBackpressure() {
        if (!this.paused) {
            return;
        }
        this.paused = false;
        this.setFlushRef();
        this.emit('bufferLow');
    }
    /**
     * Forcefully restart the connection timeout (e.g. on state change) from subclass.
     */
    restartConnectionTimeout() {
        clearTimeout(this.connectionTimeoutRef);
        this.connectionTimeoutRef = setTimeout(() => {
            if (this.isFinished) {
                return;
            }
            this.close(new Error(`timed out after ${this.newConnectionTimeout}ms`));
        }, this.newConnectionTimeout);
    }
}
exports.WebRtcConnection = WebRtcConnection;
//# sourceMappingURL=WebRtcConnection.js.map