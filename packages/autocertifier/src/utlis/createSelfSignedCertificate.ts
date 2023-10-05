import * as forge from 'node-forge'

interface Certificates {
    caCert: string
    caKey: string
    serverCert: string
    serverKey: string
}

export function createSelfSignedCertificate(fqdn: string, validMonths: number, validMilliseconds?: number): Certificates {
    // Generate a new RSA key pair for the certificate authority
    const caKeys = forge.pki.rsa.generateKeyPair(2048)

    // Create a new X.509 certificate for the certificate authority
    const caCert = forge.pki.createCertificate()
    caCert.publicKey = caKeys.publicKey
    caCert.serialNumber = '01'
    caCert.validity.notBefore = new Date()
    caCert.validity.notAfter = new Date()

    if (validMonths > 0) {
        caCert.validity.notAfter.setMonth(caCert.validity.notBefore.getMonth() + validMonths)
    } else {
        caCert.validity.notAfter.setMilliseconds(caCert.validity.notBefore.getMilliseconds() + validMilliseconds!)
    }
    
    const attrs = [
        { name: 'commonName', value: fqdn },
        { name: 'countryName', value: 'US' },
        { shortName: 'ST', value: 'California' },
        { name: 'localityName', value: 'San Francisco' },
        { name: 'organizationName', value: 'My Company' },
        { shortName: 'OU', value: 'My CA' }
    ]
    caCert.setSubject(attrs)
    caCert.setIssuer(attrs)
    caCert.setExtensions([
        { name: 'basicConstraints', cA: true },
        { name: 'keyUsage', keyCertSign: true, digitalSignature: true, nonRepudiation: true, keyEncipherment: true, dataEncipherment: true },
        { name: 'subjectKeyIdentifier' }
    ])
    caCert.sign(caKeys.privateKey, forge.md.sha256.create())

    // Generate a new RSA key pair for the server certificate
    const serverKeys = forge.pki.rsa.generateKeyPair(2048)

    // Create a new X.509 certificate for the server
    const serverCert = forge.pki.createCertificate()
    serverCert.publicKey = serverKeys.publicKey
    serverCert.serialNumber = '01'
    serverCert.validity.notBefore = new Date()
    serverCert.validity.notAfter = new Date()
    serverCert.validity.notAfter.setFullYear(serverCert.validity.notBefore.getFullYear() + 1)
    const serverAttrs = [
        { name: 'commonName', value: fqdn },
        { name: 'countryName', value: 'US' },
        { shortName: 'ST', value: 'California' },
        { name: 'localityName', value: 'San Francisco' },
        { name: 'organizationName', value: 'My Company' },
        { shortName: 'OU', value: 'My Server' }
    ]
    serverCert.setSubject(serverAttrs)
    serverCert.setIssuer(caCert.subject.attributes)
    serverCert.setExtensions([
        { name: 'basicConstraints', cA: false },
        { name: 'keyUsage', digitalSignature: true, nonRepudiation: true, keyEncipherment: true, dataEncipherment: true },
        { name: 'subjectAltName', altNames: [{ type: 2, value: fqdn }] },
        { name: 'subjectKeyIdentifier' }
    ])
    serverCert.sign(caKeys.privateKey, forge.md.sha256.create())

    // Return the certificates and keys as an object
    return {
        caCert: forge.pki.certificateToPem(caCert),
        caKey: forge.pki.privateKeyToPem(caKeys.privateKey),
        serverCert: forge.pki.certificateToPem(serverCert),
        serverKey: forge.pki.privateKeyToPem(serverKeys.privateKey)
    }
}
