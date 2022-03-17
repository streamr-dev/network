"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocationManager = void 0;
const geoip_lite_1 = require("geoip-lite");
const streamr_network_1 = require("streamr-network");
function isValidNodeLocation(location) {
    return (location !== undefined) && (location.country || location.city || location.latitude || location.longitude);
}
class LocationManager {
    constructor() {
        this.nodeLocations = {};
        this.logger = new streamr_network_1.Logger(module);
    }
    getAllNodeLocations() {
        return this.nodeLocations;
    }
    getNodeLocation(nodeId) {
        return this.nodeLocations[nodeId];
    }
    updateLocation({ nodeId, location, address }) {
        if (isValidNodeLocation(location)) {
            this.nodeLocations[nodeId] = location;
        }
        else if (!isValidNodeLocation(this.nodeLocations[nodeId])) {
            let geoIpRecord = null;
            if (address) {
                geoIpRecord = (0, geoip_lite_1.lookup)(address);
            }
            if (geoIpRecord) {
                this.nodeLocations[nodeId] = {
                    country: geoIpRecord.country,
                    city: geoIpRecord.city,
                    latitude: geoIpRecord.ll[0],
                    longitude: geoIpRecord.ll[1]
                };
            }
        }
    }
    removeNode(nodeId) {
        delete this.nodeLocations[nodeId];
    }
}
exports.LocationManager = LocationManager;
//# sourceMappingURL=LocationManager.js.map