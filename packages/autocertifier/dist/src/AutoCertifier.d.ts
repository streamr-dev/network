import { RestInterface } from './RestInterface';
import { CertifiedSubdomain } from './data/CertifiedSubdomain';
export declare class AutoCertifier implements RestInterface {
    private domainName?;
    private dnsServer?;
    private restServer?;
    private database?;
    private certificateCreator?;
    createNewSubdomainAndCertificate(ipAddress: string, port: string, _streamrWebSocketPort: string): Promise<CertifiedSubdomain>;
    createNewCertificateForSubdomain(subdomain: string, ipAddress: string, port: string, streamrWebSocketPort: string, token: string): Promise<CertifiedSubdomain>;
    updateSubdomainIpAndPort(subdomain: string, ipAddress: string, port: string, _streamrWebSocketPort: string, token: string): Promise<void>;
    createChallenge(name: string, value: string): Promise<void>;
    deleteChallenge(_name: string): Promise<void>;
    start(): Promise<void>;
    stop(): Promise<void>;
}
