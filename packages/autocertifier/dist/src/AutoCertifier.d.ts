import { RestInterface } from './RestInterface';
import { CertifiedSubdomain } from './data/CertifiedSubdomain';
import { Session } from './data/Session';
export declare class AutoCertifier implements RestInterface {
    private domainName?;
    private dnsServer?;
    private restServer?;
    private database?;
    private certificateCreator?;
    private streamrChallenger;
    createSession(): Promise<Session>;
    createNewSubdomainAndCertificate(ipAddress: string, port: string, streamrWebSocketPort: string, sessionId: string, streamrWebSocketCaCert?: string): Promise<CertifiedSubdomain>;
    createNewCertificateForSubdomain(subdomain: string, ipAddress: string, port: string, streamrWebSocketPort: string, sessionId: string, token: string): Promise<CertifiedSubdomain>;
    updateSubdomainIpAndPort(subdomain: string, ipAddress: string, port: string, streamrWebSocketPort: string, sessionId: string, token: string): Promise<void>;
    createChallenge(fqdn: string, value: string): Promise<void>;
    deleteChallenge(_name: string): Promise<void>;
    start(): Promise<void>;
    stop(): Promise<void>;
}
