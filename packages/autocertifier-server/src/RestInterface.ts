import { CertifiedSubdomain, Session } from '@streamr/autocertifier-client'

// TODO: is this interface needed? Could be useful for testing purposes?
// TODO: should streamrWebsocketPort be renamed? ie. requestorStreamrWebsocketPort / requestorWebsocketPort
export interface RestInterface {
    createSession(): Promise<Session>

    createNewSubdomainAndCertificate(
        ipAddress: string,
        port: string,
        streamrWebSocketPort: string,
        sessionId: string
    ): Promise<CertifiedSubdomain>

    createNewCertificateForSubdomain(
        subdomain: string,
        ipAddress: string,
        port: string,
        streamrWebSocketPort: string,
        sessionId: string,
        token: string
    ): Promise<CertifiedSubdomain>

    updateSubdomainIp(
        subdomain: string,
        ipAddress: string,
        port: string,
        streamrWebSocketPort: string,
        sessionId: string,
        token: string
    ): Promise<void>
}
