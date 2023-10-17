"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSelfSignedCertificate = void 0;
const forge = __importStar(require("node-forge"));
function createSelfSignedCertificate(fqdn, validMonths, validMilliseconds) {
    // Generate a new RSA key pair for the certificate authority
    const caKeys = forge.pki.rsa.generateKeyPair(2048);
    // Create a new X.509 certificate for the certificate authority
    const caCert = forge.pki.createCertificate();
    caCert.publicKey = caKeys.publicKey;
    caCert.serialNumber = '01';
    caCert.validity.notBefore = new Date();
    caCert.validity.notAfter = new Date();
    if (validMonths > 0) {
        caCert.validity.notAfter.setMonth(caCert.validity.notBefore.getMonth() + validMonths);
    }
    else {
        caCert.validity.notAfter.setMilliseconds(caCert.validity.notBefore.getMilliseconds() + validMilliseconds);
    }
    const attrs = [
        { name: 'commonName', value: fqdn },
        { name: 'countryName', value: 'US' },
        { shortName: 'ST', value: 'California' },
        { name: 'localityName', value: 'San Francisco' },
        { name: 'organizationName', value: 'My Company' },
        { shortName: 'OU', value: 'My CA' }
    ];
    caCert.setSubject(attrs);
    caCert.setIssuer(attrs);
    caCert.setExtensions([
        { name: 'basicConstraints', cA: true },
        { name: 'keyUsage', keyCertSign: true, digitalSignature: true, nonRepudiation: true, keyEncipherment: true, dataEncipherment: true },
        { name: 'subjectKeyIdentifier' }
    ]);
    caCert.sign(caKeys.privateKey, forge.md.sha256.create());
    // Generate a new RSA key pair for the server certificate
    const serverKeys = forge.pki.rsa.generateKeyPair(2048);
    // Create a new X.509 certificate for the server
    const serverCert = forge.pki.createCertificate();
    serverCert.publicKey = serverKeys.publicKey;
    serverCert.serialNumber = '01';
    serverCert.validity.notBefore = new Date();
    serverCert.validity.notAfter = new Date();
    serverCert.validity.notAfter.setFullYear(serverCert.validity.notBefore.getFullYear() + 1);
    const serverAttrs = [
        { name: 'commonName', value: fqdn },
        { name: 'countryName', value: 'US' },
        { shortName: 'ST', value: 'California' },
        { name: 'localityName', value: 'San Francisco' },
        { name: 'organizationName', value: 'My Company' },
        { shortName: 'OU', value: 'My Server' }
    ];
    serverCert.setSubject(serverAttrs);
    serverCert.setIssuer(caCert.subject.attributes);
    serverCert.setExtensions([
        { name: 'basicConstraints', cA: false },
        { name: 'keyUsage', digitalSignature: true, nonRepudiation: true, keyEncipherment: true, dataEncipherment: true },
        { name: 'subjectAltName', altNames: [{ type: 2, value: fqdn }] },
        { name: 'subjectKeyIdentifier' }
    ]);
    serverCert.sign(caKeys.privateKey, forge.md.sha256.create());
    // Return the certificates and keys as an object
    return {
        caCert: forge.pki.certificateToPem(caCert),
        caKey: forge.pki.privateKeyToPem(caKeys.privateKey),
        serverCert: forge.pki.certificateToPem(serverCert),
        serverKey: forge.pki.privateKeyToPem(serverKeys.privateKey)
    };
}
exports.createSelfSignedCertificate = createSelfSignedCertificate;
//# sourceMappingURL=createSelfSignedCertificate.js.map