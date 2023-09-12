import { Database } from './Database';
export declare class DnsServer {
    private domainName;
    private ownHostName;
    private dnsServerPort;
    private ownIpAddress;
    private db;
    private server?;
    constructor(domainName: string, ownHostName: string, dnsServerPort: string, ownIpAddress: string, db: Database);
    createSubdomain(subdomain: string, ipAddress: string, port: string, token: string): Promise<void>;
    updateSubdomainIpAndPort(subdomain: string, ipAddress: string, port: string, token: string): Promise<void>;
    updateSubdomainAcmeChallenge(fqdn: string, acmeChallenge: string): Promise<void>;
    private handleSOAQuery;
    private handleNSQuery;
    private handleTextQuery;
    private handleAAAAQuery;
    private handleCNAMEQuery;
    private handleCAAQuery;
    private handleNormalQuery;
    private handleQuery;
    start(): Promise<void>;
    stop(): Promise<void>;
}
