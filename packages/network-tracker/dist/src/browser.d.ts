import { Tracker, Event as TrackerEvent } from './logic/Tracker';
import { getTopology } from './logic/trackerSummaryUtils';
import { TrackerServer, Event as TrackerServerEvent } from './protocol/TrackerServer';
export declare const BrowserTracker: {
    startTracker: ({ listen, id, name, location, attachHttpEndpoints, maxNeighborsPerNode, metricsContext, trackerPingInterval, privateKeyFileName, certFileName, topologyStabilization }: import("./startTracker").TrackerOptions) => Promise<Tracker>;
    Tracker: typeof Tracker;
    TrackerEvent: typeof TrackerEvent;
    getTopology: typeof getTopology;
    TrackerServer: typeof TrackerServer;
    TrackerServerEvent: typeof TrackerServerEvent;
};
