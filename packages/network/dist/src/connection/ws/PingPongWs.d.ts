import { Rtts } from "../../identifiers";
import { AbstractWsConnection } from "./AbstractWsConnection";
export type GetConnections = () => Array<AbstractWsConnection>;
export declare class PingPongWs {
    private readonly pingIntervalInMs;
    private readonly pingInterval;
    private readonly getConnections;
    constructor(getConnections: GetConnections, pingIntervalInMs: number);
    getRtts(): Rtts;
    stop(): void;
    private pingConnections;
}
