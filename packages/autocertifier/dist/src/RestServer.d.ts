import { RestInterface } from './RestInterface';
export declare class RestServer {
    private server?;
    private engine;
    private ownIpAddress;
    private port;
    private caCertPath;
    private caKeyPath;
    private certPath;
    private keyPath;
    constructor(ownIpAddress: string, port: string, caCertPath: string, caKeyPath: string, certPath: string, keyPath: string, engine: RestInterface);
    start(): Promise<void>;
    private createSession;
    private createSubdomainAndCertificate;
    private createNewCertificateForExistingSubdomain;
    private updateSubdomainIpAndPort;
    private createSelfSignedCertsIfTheyDontExist;
    private sendError;
    private sendResponse;
    private extractIpAndPort;
    stop(): Promise<void>;
}
