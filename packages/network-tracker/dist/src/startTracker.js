"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startTracker = void 0;
const uuid_1 = require("uuid");
const Tracker_1 = require("./logic/Tracker");
const TrackerServer_1 = require("./protocol/TrackerServer");
const trackerHttpEndpoints_1 = require("./logic/trackerHttpEndpoints");
const streamr_network_1 = require("streamr-network");
const startTracker = async ({ listen, id = (0, uuid_1.v4)(), name, location, attachHttpEndpoints = true, maxNeighborsPerNode = streamr_network_1.DEFAULT_MAX_NEIGHBOR_COUNT, metricsContext = new streamr_network_1.MetricsContext(id), trackerPingInterval, privateKeyFileName, certFileName, topologyStabilization }) => {
    const peerInfo = streamr_network_1.PeerInfo.newTracker(id, name, undefined, undefined, location);
    const httpServer = await (0, streamr_network_1.startHttpServer)(listen, privateKeyFileName, certFileName);
    const endpoint = new streamr_network_1.ServerWsEndpoint(listen, privateKeyFileName !== undefined, httpServer, peerInfo, metricsContext, trackerPingInterval);
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
        (0, trackerHttpEndpoints_1.trackerHttpEndpoints)(httpServer, tracker, metricsContext);
    }
    return tracker;
};
exports.startTracker = startTracker;
//# sourceMappingURL=startTracker.js.map