"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrowserTracker = void 0;
const startTracker_1 = require("./startTracker");
const Tracker_1 = require("./logic/Tracker");
const trackerSummaryUtils_1 = require("./logic/trackerSummaryUtils");
const TrackerServer_1 = require("./protocol/TrackerServer");
exports.BrowserTracker = {
    startTracker: startTracker_1.startTracker,
    Tracker: Tracker_1.Tracker,
    // TrackerOptions,
    TrackerEvent: Tracker_1.Event,
    getTopology: trackerSummaryUtils_1.getTopology,
    TrackerServer: TrackerServer_1.TrackerServer,
    TrackerServerEvent: TrackerServer_1.Event
};
//# sourceMappingURL=browser.js.map