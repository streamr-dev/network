import { CertifiedSubdomain } from './data/CertifiedSubdomain'

export interface RestInterface {
    createNewSubdomainAndCertificate(ipAddress: string, port: string, streamrWebSocketPort: string): Promise<CertifiedSubdomain>
    createNewCertificateForSubdomain(subdomain: string, ipAddress: string, port: string, 
        streamrWebSocketPort: string, token: string): Promise<CertifiedSubdomain>
    updateSubdomainIpAndPort(subdomain: string, ipAddress: string, port: string, streamrWebSocketPort: string, token: string): Promise<void>
}
