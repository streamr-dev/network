"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocationManager = void 0;
function isValidNodeLocation(location) {
    return location && (location.country || location.city || location.latitude || location.longitude);
}
class LocationManager {
    constructor() {
        this.nodeLocations = {};
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