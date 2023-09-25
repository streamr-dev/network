interface Certificates {
    caCert: string;
    caKey: string;
    serverCert: string;
    serverKey: string;
}
export declare function createSelfSignedCertificate(validMonths: number, validMilliseconds?: number): Certificates;
export {};
