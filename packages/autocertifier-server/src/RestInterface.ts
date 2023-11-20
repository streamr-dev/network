import { CertifiedSubdomain } from '@streamr/autocertifier-client'
import { Session } from '@streamr/autocertifier-client'

// TODO: is this interface needed? Could be useful for testing purposes?
// TODO: should streamrWebsocketPort be renamed? ie. requestorStreamrWebsocketPort / requestorWebsocketPort 
export interface RestInterface {
    createSession(): Promise<Session>
    
    createNewSubdomainAndCertificate(ipAddress: string, port: string, streamrWebSocketPort: string, 
        sessionId: string, peerId: string): Promise<CertifiedSubdomain>
    
    createNewCertificateForSubdomain(subdomain: string, ipAddress: string, port: string, 
        streamrWebSocketPort: string, sessionId: string, token: string, peerId: string): Promise<CertifiedSubdomain>
    
    updateSubdomainIp(subdomain: string, ipAddress: string, port: string, 
        streamrWebSocketPort: string, sessionId: string, token: string, peerId: string): Promise<void>
}
