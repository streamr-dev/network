/// <reference types="node" />
/// <reference types="node" />
import { Tracker } from './Tracker';
import http from 'http';
import https from 'https';
export declare function trackerHttpEndpoints(httpServer: http.Server | https.Server, tracker: Tracker): void;
