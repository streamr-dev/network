"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NodeWebRtcConnection = exports.webRtcConnectionFactory = void 0;
const WebRtcConnection_1 = require("../connection/webrtc/WebRtcConnection");
const utils_1 = require("@streamr/utils");
const NameDirectory_1 = require("../NameDirectory");
const Simulator_1 = require("./Simulator");
/* eslint-disable class-methods-use-this */
exports.webRtcConnectionFactory = new class {
    createConnection(opts) {
        return new NodeWebRtcConnection(opts);
    }
    registerWebRtcEndpoint() {
    }
    unregisterWebRtcEndpoint() {
    }
};
class NodeWebRtcConnection extends WebRtcConnection_1.WebRtcConnection {
    constructor(opts) {
        super(opts);
        //private connection: PeerConnection | null
        //private dataChannel: DataChannel | null
        this.lastState = 'connecting';
        this.open = false;
        this.remoteDescriptionSet = false;
        this.logger = new utils_1.Logger(module, { id: `${NameDirectory_1.NameDirectory.getName(this.getPeerId())}/${this.id}` });
        Simulator_1.Simulator.instance().addWebRtcConnection(this.selfId, this.getPeerId(), this);
    }
    doSendMessage(message) {
        Simulator_1.Simulator.instance().webRtcSend(this.selfId, this.getPeerId(), message);
        //return this.dataChannel!.sendMessage(message)
    }
    doConnect() {
        if (this.isOffering()) {
            this.emitLocalDescription("ICE description from " + this.selfId, "ICE Description");
            this.emitLocalCandidate("ICE candidate from " + this.selfId, "abcdefg");
        }
    }
    setRemoteDescription(_udescription, _utype) {
        this.remoteDescriptionSet = true;
        if (!this.isOffering()) {
            this.emitLocalDescription("ICE description from " + this.selfId, "ICE Description");
            this.emitLocalCandidate("ICE candidate from " + this.selfId, "abcdefg");
        }
    }
    addRemoteCandidate(_ucandidate, _umid) {
        if (this.remoteDescriptionSet) {
            Simulator_1.Simulator.instance().webRtcConnect(this.selfId, this.getPeerId());
        }
        else {
            this.logger.warn("Tried setting remoteCandidate before remote description, closing");
            this.close(new Error('Tried setting remoteCandidate before remote description, closing'));
        }
    }
    doClose(_err) {
        Simulator_1.Simulator.instance().webRtcDisconnect(this.selfId, this.getPeerId());
        this.lastState = undefined;
        this.lastGatheringState = undefined;
        this.open = false;
    }
    getBufferedAmount() {
        return 0;
    }
    getMaxMessageSize() {
        return 1024 * 1024;
    }
    isOpen() {
        return this.open;
    }
    getLastState() {
        return this.lastState;
    }
    getLastGatheringState() {
        return this.lastGatheringState;
    }
    // called by simulator
    handleIncomingMessage(message) {
        this.logger.trace('dc.onmessage');
        this.emitMessage(message);
    }
    handleIncomingDisconnection() {
        this.logger.trace('dc.onClosed');
        this.close();
    }
    handleIncomingConnection() {
        this.open = true;
        this.lastState = 'connected';
        this.emitOpen();
    }
}
exports.NodeWebRtcConnection = NodeWebRtcConnection;
//# sourceMappingURL=NodeWebRtcConnection_simulator.js.map