import { CertifiedSubdomain } from '@streamr/autocertifier-client'
import { Session } from '@streamr/autocertifier-client'

export interface RestInterface {
    createSession(): Promise<Session>
    
    createNewSubdomainAndCertificate(ipAddress: string, port: string, streamrWebSocketPort: string, 
        sessionId: string, streamrWebSocketCaCert?: string): Promise<CertifiedSubdomain>
    
    createNewCertificateForSubdomain(subdomain: string, ipAddress: string, port: string, 
        streamrWebSocketPort: string, sessionId: string, token: string): Promise<CertifiedSubdomain>
    
    updateSubdomainIpAndPort(subdomain: string, ipAddress: string, port: string, 
        streamrWebSocketPort: string, sessionId: string, token: string): Promise<void>
}
