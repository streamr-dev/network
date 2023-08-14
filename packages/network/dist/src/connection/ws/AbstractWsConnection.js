"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AbstractWsConnection = exports.LOW_BACK_PRESSURE = exports.HIGH_BACK_PRESSURE = void 0;
const utils_1 = require("@streamr/utils");
exports.HIGH_BACK_PRESSURE = 1024 * 1024 * 2;
exports.LOW_BACK_PRESSURE = 1024 * 1024;
class AbstractWsConnection {
    constructor(peerInfo) {
        this.respondedPong = true;
        this.highBackPressure = false;
        this.peerInfo = peerInfo;
        this.logger = new utils_1.Logger(module, { peerId: peerInfo.peerId });
    }
    setBackPressureHandlers(onLowBackPressure, onHighBackPressure) {
        if (this.onLowBackPressure === undefined && this.onHighBackPressure === undefined) {
            this.onLowBackPressure = onLowBackPressure;
            this.onHighBackPressure = onHighBackPressure;
        }
        else {
            throw new Error('invariant: cannot re-set backpressure handlers');
        }
    }
    ping() {
        this.respondedPong = false;
        this.rttStart = Date.now();
        this.sendPing();
    }
    onPong() {
        this.respondedPong = true;
        this.rtt = Date.now() - this.rttStart;
    }
    evaluateBackPressure() {
        const bufferedAmount = this.getBufferedAmount();
        if (!this.highBackPressure && bufferedAmount > exports.HIGH_BACK_PRESSURE) {
            this.logger.debug('Encountered high back pressure', {
                peerId: this.getPeerInfo().peerId, bufferedAmount
            });
            this.highBackPressure = true;
            if (this.onHighBackPressure === undefined) {
                throw new Error('onHighBackPressure listener not set');
            }
            this.onHighBackPressure();
        }
        else if (this.highBackPressure && bufferedAmount < exports.LOW_BACK_PRESSURE) {
            this.logger.debug('Encountered low back pressure', {
                peerId: this.getPeerInfo().peerId, bufferedAmount
            });
            this.highBackPressure = false;
            if (this.onLowBackPressure === undefined) {
                throw new Error('onLowBackPressure listener not set');
            }
            this.onLowBackPressure();
        }
    }
    getPeerInfo() {
        return this.peerInfo;
    }
    getRespondedPong() {
        return this.respondedPong;
    }
    getRtt() {
        return this.rtt;
    }
    getPeerId() {
        return this.getPeerInfo().peerId;
    }
    getDiagnosticInfo() {
        const getHumanReadableReadyState = (n) => {
            switch (n) {
                case 0: return 'connecting';
                case 1: return 'open';
                case 2: return 'closing';
                case 3: return 'closed';
                default: return `unknown (${n})`;
            }
        };
        return {
            peerId: this.getPeerId(),
            rtt: this.getRtt(),
            respondedPong: this.getRespondedPong(),
            readyState: getHumanReadableReadyState(this.getReadyState()),
            bufferedAmount: this.getBufferedAmount(),
            highBackPressure: this.highBackPressure,
        };
    }
}
exports.AbstractWsConnection = AbstractWsConnection;
//# sourceMappingURL=AbstractWsConnection.js.map