"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createNetworkNode = exports.TEST_CONFIG = void 0;
const NodeToTracker_1 = require("./protocol/NodeToTracker");
const NodeToNode_1 = require("./protocol/NodeToNode");
const RtcSignaller_1 = require("./logic/RtcSignaller");
const NetworkNode_1 = require("./logic/NetworkNode");
const NegotiatedProtocolVersions_1 = require("./connection/NegotiatedProtocolVersions");
const PeerInfo_1 = require("./connection/PeerInfo");
const NodeClientWsEndpoint_1 = __importDefault(require("./connection/ws/NodeClientWsEndpoint"));
const WebRtcEndpoint_1 = require("./connection/webrtc/WebRtcEndpoint");
const NodeWebRtcConnection_1 = require("./connection/webrtc/NodeWebRtcConnection");
exports.TEST_CONFIG = {
    disconnectionWaitTime: 30 * 1000,
    peerPingInterval: 30 * 1000,
    newWebrtcConnectionTimeout: 15 * 1000,
    webrtcDatachannelBufferThresholdLow: 2 ** 15,
    webrtcDatachannelBufferThresholdHigh: 2 ** 17,
    webrtcSendBufferMaxMessageCount: 500,
    iceServers: [],
    rttUpdateTimeout: 15 * 1000,
    trackerConnectionMaintenanceInterval: 5 * 1000,
    webrtcDisallowPrivateAddresses: false,
    acceptProxyConnections: false,
    trackerPingInterval: 60 * 1000,
    webrtcPortRange: {
        min: 6000,
        max: 65535
    },
    webrtcMaxMessageSize: 1048576
};
const createNetworkNode = ({ id, location, trackers, metricsContext, peerPingInterval, trackerPingInterval, disconnectionWaitTime, newWebrtcConnectionTimeout, rttUpdateTimeout, webrtcDatachannelBufferThresholdLow, webrtcDatachannelBufferThresholdHigh, webrtcSendBufferMaxMessageCount, iceServers, trackerConnectionMaintenanceInterval, webrtcDisallowPrivateAddresses, acceptProxyConnections, webrtcPortRange, webrtcMaxMessageSize, externalIp }) => {
    const peerInfo = PeerInfo_1.PeerInfo.newNode(id, undefined, undefined, location);
    const endpoint = new NodeClientWsEndpoint_1.default(peerInfo, trackerPingInterval);
    const nodeToTracker = new NodeToTracker_1.NodeToTracker(endpoint);
    const webRtcSignaller = new RtcSignaller_1.RtcSignaller(peerInfo, nodeToTracker);
    const negotiatedProtocolVersions = new NegotiatedProtocolVersions_1.NegotiatedProtocolVersions(peerInfo);
    const nodeToNode = new NodeToNode_1.NodeToNode(new WebRtcEndpoint_1.WebRtcEndpoint(peerInfo, iceServers, webRtcSignaller, metricsContext, negotiatedProtocolVersions, NodeWebRtcConnection_1.webRtcConnectionFactory, newWebrtcConnectionTimeout, peerPingInterval, webrtcDatachannelBufferThresholdLow, webrtcDatachannelBufferThresholdHigh, webrtcSendBufferMaxMessageCount, webrtcDisallowPrivateAddresses, webrtcPortRange, webrtcMaxMessageSize, externalIp));
    return new NetworkNode_1.NetworkNode({
        peerInfo,
        trackers,
        protocols: {
            nodeToTracker,
            nodeToNode
        },
        metricsContext,
        disconnectionWaitTime,
        rttUpdateTimeout,
        trackerConnectionMaintenanceInterval,
        acceptProxyConnections
    });
};
exports.createNetworkNode = createNetworkNode;
//# sourceMappingURL=createNetworkNode.js.map