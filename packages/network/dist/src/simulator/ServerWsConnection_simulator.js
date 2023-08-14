"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServerWsConnection = exports.staticLogger = void 0;
const AbstractWsConnection_1 = require("../connection/ws/AbstractWsConnection");
const AbstractWsEndpoint_1 = require("../connection/ws/AbstractWsEndpoint");
const utils_1 = require("@streamr/utils");
const Simulator_1 = require("./Simulator");
exports.staticLogger = new utils_1.Logger(module);
class ServerWsConnection extends AbstractWsConnection_1.AbstractWsConnection {
    constructor(ownAddress, ownPeerInfo, remoteAddress, remotePeerInfo) {
        super(remotePeerInfo);
        this.readyState = 1;
        this.ownAddress = ownAddress;
        this.ownPeerInfo = ownPeerInfo;
        this.remoteAddress = remoteAddress;
    }
    close(code, reason) {
        Simulator_1.Simulator.instance().wsDisconnect(this.ownAddress, this.ownPeerInfo, this.remoteAddress, code, reason);
        this.readyState = 3;
    }
    terminate() {
        Simulator_1.Simulator.instance().wsDisconnect(this.ownAddress, this.ownPeerInfo, this.remoteAddress, AbstractWsEndpoint_1.DisconnectionCode.GRACEFUL_SHUTDOWN, AbstractWsEndpoint_1.DisconnectionReason.GRACEFUL_SHUTDOWN);
        this.readyState = 3;
    }
    // eslint-disable-next-line class-methods-use-this
    getBufferedAmount() {
        return 0;
    }
    getReadyState() {
        return this.readyState;
    }
    sendPing() {
        Simulator_1.Simulator.instance().wsSend(this.ownAddress, this.ownPeerInfo, this.remoteAddress, "ping").then(() => {
            return;
        }).catch(() => {
        });
    }
    async send(message) {
        const readyState = this.getReadyState();
        if (this.getReadyState() !== 1) {
            throw new Error(`cannot send, readyState is ${readyState}`);
        }
        try {
            await Simulator_1.Simulator.instance().wsSend(this.ownAddress, this.ownPeerInfo, this.remoteAddress, message);
        }
        catch (err) {
            return Promise.reject(err);
        }
    }
    getRemoteAddress() {
        return this.remoteAddress;
    }
}
exports.ServerWsConnection = ServerWsConnection;
//# sourceMappingURL=ServerWsConnection_simulator.js.map