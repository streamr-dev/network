"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startTracker = void 0;
const uuid_1 = require("uuid");
const Tracker_1 = require("./logic/Tracker");
const TrackerServer_1 = require("./protocol/TrackerServer");
const trackerHttpEndpoints_1 = require("./logic/trackerHttpEndpoints");
const network_node_1 = require("@streamr/network-node");
const utils_1 = require("@streamr/utils");
const startTracker = async ({ listen, id = (0, uuid_1.v4)(), location, attachHttpEndpoints = true, maxNeighborsPerNode = network_node_1.DEFAULT_MAX_NEIGHBOR_COUNT, metricsContext = new utils_1.MetricsContext(), trackerPingInterval, privateKeyFileName, certFileName, topologyStabilization }) => {
    const peerInfo = network_node_1.PeerInfo.newTracker(id, undefined, undefined, location);
    const httpServer = await (0, network_node_1.startHttpServer)(listen, privateKeyFileName, certFileName);
    const endpoint = new network_node_1.ServerWsEndpoint(listen, privateKeyFileName !== undefined, httpServer, peerInfo, trackerPingInterval);
    const tracker = new Tracker_1.Tracker({
        peerInfo,
        protocols: {
            trackerServer: new TrackerServer_1.TrackerServer(endpoint)
        },
        metricsContext,
        maxNeighborsPerNode,
        topologyStabilization
    });
    if (attachHttpEndpoints) {
        (0, trackerHttpEndpoints_1.trackerHttpEndpoints)(httpServer, tracker);
    }
    return tracker;
};
exports.startTracker = startTracker;
//# sourceMappingURL=startTracker.js.map