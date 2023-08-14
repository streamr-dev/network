"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrackerConnector = void 0;
const utils_1 = require("@streamr/utils");
const PeerInfo_1 = require("../connection/PeerInfo");
const NameDirectory_1 = require("../NameDirectory");
const logger = new utils_1.Logger(module);
var ConnectionState;
(function (ConnectionState) {
    ConnectionState[ConnectionState["SUCCESS"] = 0] = "SUCCESS";
    ConnectionState[ConnectionState["ERROR"] = 1] = "ERROR";
})(ConnectionState || (ConnectionState = {}));
class TrackerConnector {
    constructor(getStreamParts, connectToTracker, disconnectFromTracker, trackerRegistry, maintenanceInterval) {
        this.getStreamParts = getStreamParts;
        this.connectToTracker = connectToTracker;
        this.disconnectFromTracker = disconnectFromTracker;
        this.trackerRegistry = trackerRegistry;
        this.maintenanceInterval = maintenanceInterval;
        this.connectionStates = new Map();
        this.signallingOnlySessions = new Map();
    }
    onNewStreamPart(streamPartId) {
        const trackerInfo = this.trackerRegistry.getTracker(streamPartId);
        this.connectTo(trackerInfo);
    }
    async addSignallingOnlySession(streamPartId, nodeToSignal) {
        const tracker = this.trackerRegistry.getTracker(streamPartId);
        if (!this.signallingOnlySessions.has(streamPartId)) {
            this.signallingOnlySessions.set(streamPartId, new Set());
        }
        this.signallingOnlySessions.get(streamPartId).add(nodeToSignal);
        await this.connectToTracker(tracker.ws, PeerInfo_1.PeerInfo.newTracker(tracker.id));
        logger.info('Connected to tracker for signalling only', { trackerId: NameDirectory_1.NameDirectory.getName(tracker.id) });
    }
    removeSignallingOnlySession(streamPartId, nodeToSignal) {
        if (this.signallingOnlySessions.has(streamPartId)) {
            const session = this.signallingOnlySessions.get(streamPartId);
            session.delete(nodeToSignal);
            if (session.size === 0) {
                this.signallingOnlySessions.delete(streamPartId);
            }
        }
    }
    start() {
        this.maintainConnections();
        this.maintenanceTimer = setInterval(this.maintainConnections.bind(this), this.maintenanceInterval);
    }
    stop() {
        if (this.maintenanceTimer) {
            clearInterval(this.maintenanceTimer);
            this.maintenanceTimer = null;
        }
    }
    maintainConnections() {
        this.trackerRegistry.getAllTrackers().forEach((trackerInfo) => {
            if (this.isActiveTracker(trackerInfo.id)) {
                this.connectTo(trackerInfo);
            }
            else {
                this.disconnectFromTracker(trackerInfo.id);
            }
        });
    }
    connectTo({ id, ws }) {
        this.connectToTracker(ws, PeerInfo_1.PeerInfo.newTracker(id))
            .then(() => {
            if (this.connectionStates.get(id) !== ConnectionState.SUCCESS) {
                logger.info('Connected to tracker', {
                    trackerId: NameDirectory_1.NameDirectory.getName(id)
                });
                this.connectionStates.set(id, ConnectionState.SUCCESS);
            }
            return;
        })
            .catch((err) => {
            if (this.connectionStates.get(id) !== ConnectionState.ERROR) {
                // TODO we could also store the previous error and check that the current error is the same?
                // -> now it doesn't log anything if the connection error reason changes
                this.connectionStates.set(id, ConnectionState.ERROR);
                logger.warn('Could not connect to tracker', {
                    trackerId: NameDirectory_1.NameDirectory.getName(id),
                    reason: err.message
                });
            }
        });
    }
    isActiveTracker(trackerId) {
        const streamPartIds = [...this.getStreamParts(), ...this.signallingOnlySessions.keys()];
        for (const streamPartId of streamPartIds) {
            if (this.trackerRegistry.getTracker(streamPartId).id === trackerId) {
                return true;
            }
        }
        return false;
    }
}
exports.TrackerConnector = TrackerConnector;
//# sourceMappingURL=TrackerConnector.js.map