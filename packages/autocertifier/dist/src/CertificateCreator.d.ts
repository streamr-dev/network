import { ChallengeInterface } from './ChallengeInterface';
import { Certificate } from './data/Certificate';
export declare class CertificateCreator {
    private acmeDirectoryUrl;
    private hmacKid;
    private hmacKey;
    private challengeInterface;
    private accountPrivateKey?;
    private accountPrivateKeyPath;
    constructor(acmeDirectoryUrl: string, hmacKid: string, hmacKey: string, privateKeyPath: string, challengeInterface: ChallengeInterface);
    createCertificate(fqdn: string): Promise<Certificate>;
    start(): Promise<void>;
}
