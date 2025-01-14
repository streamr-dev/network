import * as forge from 'node-forge'

interface CertificateChain {
    caCert: string
    caKey: string
    serverCert: string
    serverKey: string
}

const SAN_TYPE_DNS = 2

// TODO: move to DHT? might need in tests for autocertifier-client
export function createSelfSignedCertificate(fqdn: string, validMonths: number): CertificateChain {
    if (validMonths <= 0) {
        throw new Error('validMonths must be greater than 0')
    }

    // Generate a new RSA key pair for the certificate authority
    const caKeys = forge.pki.rsa.generateKeyPair(2048)

    // Create a new X.509 certificate for the certificate authority
    const caCert = forge.pki.createCertificate()
    caCert.publicKey = caKeys.publicKey
    caCert.serialNumber = '01' // Serial number is required but not important for self-signed certificates
    caCert.validity.notBefore = new Date()
    caCert.validity.notAfter = new Date()
    caCert.validity.notAfter.setMonth(caCert.validity.notBefore.getMonth() + validMonths)

    const attrs = [
        { name: 'commonName', value: fqdn },
        { name: 'countryName', value: '-' },
        { shortName: 'ST', value: '-' },
        { name: 'localityName', value: '-' },
        { name: 'organizationName', value: '-' },
        { shortName: 'OU', value: '-' }
    ]
    caCert.setSubject(attrs)
    caCert.setIssuer(attrs)
    caCert.setExtensions([
        { name: 'basicConstraints', cA: true },
        {
            name: 'keyUsage',
            keyCertSign: true,
            digitalSignature: true,
            nonRepudiation: true,
            keyEncipherment: true,
            dataEncipherment: true
        },
        { name: 'subjectKeyIdentifier' }
    ])
    caCert.sign(caKeys.privateKey, forge.md.sha256.create())

    // Generate a new RSA key pair for the server certificate
    const serverKeys = forge.pki.rsa.generateKeyPair(2048)

    // Create a new X.509 certificate for the server
    const serverCert = forge.pki.createCertificate()
    serverCert.publicKey = serverKeys.publicKey
    serverCert.serialNumber = '01' // Serial number is required but not important for self-signed certificates
    serverCert.validity.notBefore = new Date()
    serverCert.validity.notAfter = new Date()
    serverCert.validity.notAfter.setFullYear(serverCert.validity.notBefore.getFullYear() + 1)
    serverCert.setSubject(attrs)
    serverCert.setIssuer(caCert.subject.attributes)
    serverCert.setExtensions([
        { name: 'basicConstraints', cA: false },
        {
            name: 'keyUsage',
            digitalSignature: true,
            nonRepudiation: true,
            keyEncipherment: true,
            dataEncipherment: true
        },
        { name: 'subjectAltName', altNames: [{ type: SAN_TYPE_DNS, value: fqdn }] },
        { name: 'subjectKeyIdentifier' }
    ])
    serverCert.sign(caKeys.privateKey, forge.md.sha256.create())

    return {
        caCert: forge.pki.certificateToPem(caCert),
        caKey: forge.pki.privateKeyToPem(caKeys.privateKey),
        serverCert: forge.pki.certificateToPem(serverCert),
        serverKey: forge.pki.privateKeyToPem(serverKeys.privateKey)
    }
}
