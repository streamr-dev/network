"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PingPongWs = void 0;
const utils_1 = require("@streamr/utils");
const logger = new utils_1.Logger(module);
class PingPongWs {
    constructor(getConnections, pingIntervalInMs) {
        this.getConnections = getConnections;
        this.pingIntervalInMs = pingIntervalInMs;
        this.pingInterval = setInterval(() => this.pingConnections(), pingIntervalInMs);
    }
    getRtts() {
        const rtts = {};
        this.getConnections().forEach((connection) => {
            const rtt = connection.getRtt();
            if (rtt !== undefined) {
                rtts[connection.getPeerId()] = rtt;
            }
        });
        return rtts;
    }
    stop() {
        clearInterval(this.pingInterval);
    }
    pingConnections() {
        this.getConnections().forEach((connection) => {
            if (!connection.getRespondedPong()) {
                logger.warn('Terminate connection (did not receive pong response in time)', {
                    peerId: connection.getPeerId(),
                    pingIntervalInMs: this.pingIntervalInMs
                });
                connection.terminate();
            }
            else {
                try {
                    connection.ping();
                    logger.trace('Sent ping', {
                        peerId: connection.getPeerId(),
                        rtt: connection.getRtt()
                    });
                }
                catch (err) {
                    logger.warn('Terminate connection (error thrown when attempting to ping)', {
                        peerId: connection.getPeerId(),
                        err
                    });
                    connection.terminate();
                }
            }
        });
    }
}
exports.PingPongWs = PingPongWs;
//# sourceMappingURL=PingPongWs.js.map