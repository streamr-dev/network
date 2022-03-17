/// <reference types="node" />
import { MetricsContext } from 'streamr-network';
import { Tracker } from './Tracker';
import http from 'http';
import https from 'https';
export declare function trackerHttpEndpoints(httpServer: http.Server | https.Server, tracker: Tracker, metricsContext: MetricsContext): void;
