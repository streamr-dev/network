interface Certificates {
    caCert: string;
    caKey: string;
    serverCert: string;
    serverKey: string;
}
export declare function createSelfSignedCertificate(fqdn: string, validMonths: number, validMilliseconds?: number): Certificates;
export {};
