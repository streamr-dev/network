export declare class Database {
    private db?;
    private createSubdomainStatement?;
    private getSubdomainStatement?;
    private getSubdomainWithTokenStatement?;
    private updateSubdomainIpAndPortStatement?;
    private getSubdomainAcmeChallengeStatement?;
    private updateSubdomainAcmeChallengeStatement?;
    private databaseFilePath;
    constructor(filePath: string);
    createSubdomain(subdomain: string, ip: string, port: string, token: string): Promise<void>;
    getSubdomain(subdomain: string): Promise<Subdomain | undefined>;
    private getSubdomainWithToken;
    updateSubdomainIpAndPort(subdomain: string, ip: string, port: string, token: string): Promise<void>;
    updateSubdomainAcmeChallenge(subdomain: string, acmeChallenge: string): Promise<void>;
    start(): Promise<void>;
    stop(): Promise<void>;
    private createTables;
}
export interface Subdomain {
    subdomainName: string;
    ip: string;
    port: string;
    token: string;
    acmeChallenge?: string | null;
    createdAt?: Date;
    id?: number;
}
