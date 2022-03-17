"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startTracker = void 0;
const uuid_1 = require("uuid");
const MetricsContext_1 = require("../../network/src/helpers/MetricsContext");
const PeerInfo_1 = require("../../network/src/connection/PeerInfo");
const ServerWsEndpoint_1 = require("../../network/src/connection/ws/ServerWsEndpoint");
const Tracker_1 = require("./logic/Tracker");
const config_1 = require("./logic/config");
const TrackerServer_1 = require("./protocol/TrackerServer");
const trackerHttpEndpoints_1 = require("./logic/trackerHttpEndpoints");
const startTracker = async ({ listen, id = (0, uuid_1.v4)(), name, location, attachHttpEndpoints = true, maxNeighborsPerNode = config_1.DEFAULT_MAX_NEIGHBOR_COUNT, metricsContext = new MetricsContext_1.MetricsContext(id), trackerPingInterval, privateKeyFileName, certFileName, topologyStabilization }) => {
    const peerInfo = PeerInfo_1.PeerInfo.newTracker(id, name, undefined, undefined, location);
    const httpServer = await (0, ServerWsEndpoint_1.startHttpServer)(listen, privateKeyFileName, certFileName);
    const endpoint = new ServerWsEndpoint_1.ServerWsEndpoint(listen, privateKeyFileName !== undefined, httpServer, peerInfo, metricsContext, trackerPingInterval);
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