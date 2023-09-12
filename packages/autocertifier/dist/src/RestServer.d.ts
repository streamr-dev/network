import { RestInterface } from './RestInterface';
export declare class RestServer {
    private ownIpAddress;
    private port;
    private engine;
    private server?;
    constructor(ownIpAddress: string, port: string, engine: RestInterface);
    private extractIpAndPort;
    start(): Promise<void>;
    stop(): Promise<void>;
}
