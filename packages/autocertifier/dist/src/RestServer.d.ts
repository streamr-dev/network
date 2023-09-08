import { RestInterface } from './RestInterface';
export declare class RestServer {
    private port;
    private engine;
    private server?;
    constructor(port: string, engine: RestInterface);
    private extractIpAndPort;
    start(): Promise<void>;
    stop(): Promise<void>;
}
