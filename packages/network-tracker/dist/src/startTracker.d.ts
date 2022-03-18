import { TopologyStabilizationOptions, Tracker } from './logic/Tracker';
import { AbstractNodeOptions, HttpServerConfig } from 'streamr-network';
export interface TrackerOptions extends AbstractNodeOptions {
    listen: HttpServerConfig;
    attachHttpEndpoints?: boolean;
    maxNeighborsPerNode?: number;
    privateKeyFileName?: string;
    certFileName?: string;
    topologyStabilization?: TopologyStabilizationOptions;
}
export declare const startTracker: ({ listen, id, name, location, attachHttpEndpoints, maxNeighborsPerNode, metricsContext, trackerPingInterval, privateKeyFileName, certFileName, topologyStabilization }: TrackerOptions) => Promise<Tracker>;
