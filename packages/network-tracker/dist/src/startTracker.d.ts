import { TopologyStabilizationOptions, Tracker } from './logic/Tracker';
import { AbstractNodeOptions, HttpServerConfig } from '@streamr/network-node';
export interface TrackerOptions extends AbstractNodeOptions {
    listen: HttpServerConfig;
    attachHttpEndpoints?: boolean;
    maxNeighborsPerNode?: number;
    privateKeyFileName?: string;
    certFileName?: string;
    topologyStabilization?: TopologyStabilizationOptions;
}
export declare const startTracker: ({ listen, id, location, attachHttpEndpoints, maxNeighborsPerNode, metricsContext, trackerPingInterval, privateKeyFileName, certFileName, topologyStabilization }: TrackerOptions) => Promise<Tracker>;
