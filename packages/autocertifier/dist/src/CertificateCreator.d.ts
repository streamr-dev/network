/// <reference types="node" />
import { ChallengeInterface } from './ChallengeInterface';
import { Certificate } from './data/Certificate';
export declare class CertificateCreator {
    private acmeDirectoryUrl;
    private hmacKid;
    private hmacKey;
    private accountPrivateKeyPath;
    private challengeInterface;
    accountPrivateKey?: Buffer;
    constructor(acmeDirectoryUrl: string, hmacKid: string, hmacKey: string, accountPrivateKeyPath: string, challengeInterface: ChallengeInterface);
    createCertificate(fqdn: string): Promise<Certificate>;
    start(): Promise<void>;
}
