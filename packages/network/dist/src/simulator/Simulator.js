"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Simulator = exports.cleanAddress = exports.SimulatedNode = void 0;
class SimulatedNode {
    constructor(wsServerEndpoint, wsClientEndpoint) {
        this.wsServerEndpoint = wsServerEndpoint;
        this.wsClientEndpoint = wsClientEndpoint;
    }
}
exports.SimulatedNode = SimulatedNode;
function cleanAddress(addr) {
    if (typeof addr == 'undefined') {
        console.warn(new Error().stack);
    }
    let ret = '';
    if (addr.startsWith('ws://')) {
        ret = addr.substr(5);
    }
    else if (addr.startsWith('wss://')) {
        ret = addr.substr(6);
    }
    else {
        ret = addr;
    }
    if (ret.endsWith('/ws')) {
        ret = ret.substr(0, ret.length - 3);
    }
    return ret;
}
exports.cleanAddress = cleanAddress;
class Simulator {
    constructor() {
        this.nodes = {};
        this.wsEndpoints = {};
        //private webRtcEndpoints: { [address: string]: SimulatedWebRtcEndpoint } = {}
        this.webRtcConnections = {};
    }
    static instance() {
        if (!Simulator.singleton) {
            Simulator.singleton = new Simulator();
        }
        return Simulator.singleton;
    }
    addServerWsEndpoint(peerInfo, host, port, endpoint) {
        if (!this.nodes.hasOwnProperty(peerInfo.peerId)) {
            this.nodes[peerInfo.peerId] = new SimulatedNode(endpoint, null);
        }
        else {
            this.nodes[peerInfo.peerId].wsServerEndpoint = endpoint;
        }
        const addr = host + ':' + port;
        this.wsEndpoints[addr] = endpoint;
    }
    addClientWsEndpoint(peerInfo, ownAddress, endpoint) {
        if (!this.nodes.hasOwnProperty(peerInfo.peerId)) {
            this.nodes[peerInfo.peerId] = new SimulatedNode(null, endpoint);
        }
        else {
            this.nodes[peerInfo.peerId].wsClientEndpoint = endpoint;
        }
        this.wsEndpoints[ownAddress] = endpoint;
    }
    async wsDisconnect(fromAddress, fromInfo, toAddress, code, reason) {
        this.wsEndpoints[cleanAddress(toAddress)].handleIncomingDisconnection(cleanAddress(fromAddress), fromInfo, code, reason);
    }
    async wsSend(fromAddress, fromInfo, toAddress, message) {
        this.wsEndpoints[cleanAddress(toAddress)].handleIncomingMessage(cleanAddress(fromAddress), fromInfo, message);
    }
    async wsConnect(fromAddress, fromInfo, toAddress) {
        this.wsEndpoints[cleanAddress(toAddress)].handleIncomingConnection(cleanAddress(fromAddress), fromInfo);
        //return this.wsEndpoints[this.cleanAddress(toAddress)].
    }
    addWebRtcConnection(fromId, toId, connection) {
        if (!this.webRtcConnections.hasOwnProperty(fromId)) {
            this.webRtcConnections[fromId] = {};
        }
        this.webRtcConnections[fromId][toId] = connection;
    }
    //public async webRtcSend(fromId: string, toId: string, message: string): Promise<void> 
    webRtcSend(fromId, toId, message) {
        this.webRtcConnections[toId][fromId].handleIncomingMessage(message);
    }
    //public async webRtcDisconnect(fromId: string, toId: string): Promise<void> 
    webRtcDisconnect(fromId, toId) {
        if (this.webRtcConnections.hasOwnProperty(toId) && this.webRtcConnections[toId].hasOwnProperty(fromId)) {
            this.webRtcConnections[toId][fromId].handleIncomingDisconnection();
        }
    }
    webRtcConnect(fromId, toId) {
        if (this.webRtcConnections.hasOwnProperty(toId) && this.webRtcConnections[toId].hasOwnProperty(fromId)) {
            this.webRtcConnections[toId][fromId].handleIncomingConnection();
        }
    }
}
exports.Simulator = Simulator;
//# sourceMappingURL=Simulator.js.map