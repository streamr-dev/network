"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.trackerHttpEndpoints = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const trackerSummaryUtils_1 = require("./trackerSummaryUtils");
const streamr_network_1 = require("streamr-network");
const morgan_1 = __importDefault(require("morgan"));
const compression_1 = __importDefault(require("compression"));
const streamr_client_protocol_1 = require("streamr-client-protocol");
const staticLogger = new streamr_network_1.Logger(module);
const respondWithError = (res, errorMessage) => {
    res.status(422).json({
        errorMessage
    });
};
const validateStreamId = (req, res) => {
    const streamId = decodeURIComponent(req.params.streamId).trim();
    if (streamId.length === 0) {
        staticLogger.warn('422 streamId must be a not empty string');
        respondWithError(res, 'streamId cannot be empty');
        return null;
    }
    return (0, streamr_client_protocol_1.toStreamID)(streamId);
};
const validatePartition = (req, res) => {
    const partition = Number.parseInt(req.params.partition, 10);
    if (!Number.isSafeInteger(partition) || partition < 0) {
        staticLogger.warn(`422 partition must be a positive integer, askedPartition: ${partition}`);
        respondWithError(res, `partition must be a positive integer (was ${partition})`);
        return null;
    }
    return partition;
};
const cachedJsonGet = (app, endpoint, maxAge, jsonFactory) => {
    let cache;
    return app.get(endpoint, (req, res) => {
        staticLogger.debug('request to ' + endpoint);
        if ((cache === undefined) || (Date.now() > (cache.timestamp + maxAge))) {
            cache = {
                json: JSON.stringify(jsonFactory()),
                timestamp: Date.now()
            };
        }
        res.setHeader('Content-Type', 'application/json');
        res.send(cache.json);
    });
};
function trackerHttpEndpoints(httpServer, tracker, metricsContext) {
    var _a;
    const app = (0, express_1.default)();
    app.use((0, cors_1.default)());
    app.use((0, compression_1.default)());
    app.use((0, morgan_1.default)((_a = process.env.CUSTOM_MORGAN_FORMAT) !== null && _a !== void 0 ? _a : ':method :url :status :response-time ms - :res[content-length] - :remote-addr'));
    httpServer.on('request', app);
    app.get('/topology/', (req, res) => {
        staticLogger.debug('request to /topology/');
        res.json((0, trackerSummaryUtils_1.getTopology)(tracker.getOverlayPerStreamPart(), tracker.getOverlayConnectionRtts()));
    });
    app.get('/topology/:streamId/', (req, res) => {
        const streamId = validateStreamId(req, res);
        if (streamId === null) {
            return;
        }
        staticLogger.debug(`request to /topology/${streamId}/`);
        res.json((0, trackerSummaryUtils_1.getTopology)(tracker.getOverlayPerStreamPart(), tracker.getOverlayConnectionRtts(), streamId, null));
    });
    app.get('/topology/:streamId/:partition/', (req, res) => {
        const streamId = validateStreamId(req, res);
        if (streamId === null) {
            return;
        }
        const askedPartition = validatePartition(req, res);
        if (askedPartition === null) {
            return;
        }
        staticLogger.debug(`request to /topology/${streamId}/${askedPartition}/`);
        res.json((0, trackerSummaryUtils_1.getTopology)(tracker.getOverlayPerStreamPart(), tracker.getOverlayConnectionRtts(), streamId, askedPartition));
    });
    cachedJsonGet(app, '/node-connections/', 5 * 60 * 1000, () => {
        const topologyUnion = (0, trackerSummaryUtils_1.getNodeConnections)(tracker.getNodes(), tracker.getOverlayPerStreamPart());
        return Object.assign({}, ...Object.entries(topologyUnion).map(([nodeId, neighbors]) => {
            return (0, trackerSummaryUtils_1.addRttsToNodeConnections)(nodeId, Array.from(neighbors), tracker.getOverlayConnectionRtts());
        }));
    });
    app.get('/nodes/:nodeId/streams', async (req, res) => {
        const { nodeId } = req.params;
        staticLogger.debug(`request to /nodes/${nodeId}/streams`);
        const result = (0, trackerSummaryUtils_1.findStreamsPartsForNode)(tracker.getOverlayPerStreamPart(), nodeId);
        res.json(result);
    });
    app.get('/location/', (req, res) => {
        staticLogger.debug('request to /location/');
        res.json((0, trackerSummaryUtils_1.getNodesWithLocationData)(tracker.getNodes(), tracker.getAllNodeLocations()));
    });
    app.get('/location/:nodeId/', (req, res) => {
        const { nodeId } = req.params;
        const location = tracker.getNodeLocation(nodeId);
        staticLogger.debug(`request to /location/${nodeId}/`);
        res.json(location || {});
    });
    app.get('/metadata/', (req, res) => {
        staticLogger.debug('request to /metadata/');
        res.json(tracker.getAllExtraMetadatas());
    });
    app.get('/metrics/', async (req, res) => {
        const metrics = await metricsContext.report();
        staticLogger.debug('request to /metrics/');
        res.json(metrics);
    });
    app.get('/topology-size/', async (req, res) => {
        staticLogger.debug('request to /topology-size/');
        res.json((0, trackerSummaryUtils_1.getStreamPartSizes)(tracker.getOverlayPerStreamPart()));
    });
    app.get('/topology-size/:streamId/', async (req, res) => {
        const streamId = validateStreamId(req, res);
        if (streamId === null) {
            return;
        }
        staticLogger.debug(`request to /topology-size/${streamId}/`);
        res.json((0, trackerSummaryUtils_1.getStreamPartSizes)(tracker.getOverlayPerStreamPart(), streamId, null));
    });
    app.get('/topology-size/:streamId/:partition/', async (req, res) => {
        const streamId = validateStreamId(req, res);
        if (streamId === null) {
            return;
        }
        const askedPartition = validatePartition(req, res);
        if (askedPartition === null) {
            return;
        }
        staticLogger.debug(`request to /topology-size/${streamId}/${askedPartition}/`);
        res.json((0, trackerSummaryUtils_1.getStreamPartSizes)(tracker.getOverlayPerStreamPart(), streamId, askedPartition));
    });
}
exports.trackerHttpEndpoints = trackerHttpEndpoints;
//# sourceMappingURL=trackerHttpEndpoints.js.map