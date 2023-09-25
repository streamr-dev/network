import { CertifiedSubdomain } from '../data/CertifiedSubdomain';
export declare class RestClient {
    private baseUrl;
    private caCert;
    constructor(baseUrl: string, caCert: string);
    createSession(): Promise<string>;
    createNewSubdomainAndCertificate(streamrWebSocketPort: number, sessionId: string): Promise<CertifiedSubdomain>;
    updateCertificate(subdomain: string, streamrWebSocketPort: number, sessioId: string, token: string): Promise<CertifiedSubdomain>;
    updateSubdomainIpAndPort(subdomain: string, streamrWebSocketPort: number, sessioId: string, token: string): Promise<void>;
    private post;
    private put;
    private patch;
}
