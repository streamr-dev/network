"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocationManager = void 0;
const Logger_1 = require("streamr-network/dist/src/helpers/Logger");
function isValidNodeLocation(location) {
    return location && (location.country || location.city || location.latitude || location.longitude);
}
class LocationManager {
    constructor() {
        this.nodeLocations = {};
        this.logger = new Logger_1.Logger(module);
    }
    getAllNodeLocations() {
        return this.nodeLocations;
    }
    getNodeLocation(nodeId) {
        return this.nodeLocations[nodeId];
    }
    updateLocation({ nodeId, location }) {
        if (isValidNodeLocation(location)) {
            this.nodeLocations[nodeId] = location;
        }
    }
    removeNode(nodeId) {
        delete this.nodeLocations[nodeId];
    }
}
exports.LocationManager = LocationManager;
//# sourceMappingURL=LocationManager.js.map