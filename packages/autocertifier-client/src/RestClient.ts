import { Session } from './data/Session'
import { CertifiedSubdomain } from './data/CertifiedSubdomain'
import { UpdateIpAndPortRequest } from './data/UpdateIpAndPortRequest'
import { CreateCertifiedSubdomainRequest } from './data/CreateCertifiedSubdomainRequest'
import { Logger } from '@streamr/utils'
import { makeHttpRequest } from './makeHttpRequest'

const logger = new Logger('RestClient')

export class RestClient {

    private readonly baseUrl: string

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl
    }

    // TODO: can be removed. 
    // If the client creates the session we don't need to explicitly create a sessionId on the server side.
    // The server can run challanges based on a sessionId generated in each request.
    public async createSession(): Promise<string> {
        const url = this.baseUrl + '/sessions'
        try {
            const response = await makeHttpRequest<Session>('POST', url, {})
            return response.id
        } catch (err) {
            logger.debug(err)
            throw err
        }
    }

    public async createSubdomainAndCertificate(streamrWebSocketPort: number, sessionId: string): Promise<CertifiedSubdomain> {
        const url = this.baseUrl + '/certificates'
        const body: CreateCertifiedSubdomainRequest = {
            streamrWebSocketPort,
            sessionId
        }
        return await makeHttpRequest<CertifiedSubdomain>('PATCH', url, body, 2 * 60 * 1000)
    }

    public async updateCertificate(subdomain: string, streamrWebSocketPort: number, sessionId: string, token: string): Promise<CertifiedSubdomain> {
        const url = this.baseUrl + '/certificates/' + encodeURIComponent(subdomain)
        const body: UpdateIpAndPortRequest = {
            token,
            sessionId,
            streamrWebSocketPort
        }
        return await makeHttpRequest<CertifiedSubdomain>('PATCH', url, body)
    }

    public async updateSubdomainIp(subdomain: string, streamrWebSocketPort: number, sessionId: string, token: string): Promise<void> {
        logger.debug('updateSubdomainIp() subdomain: ' + subdomain + ', streamrWebSocketPort:  ' + streamrWebSocketPort
            + ', sessionId: ' + sessionId + ', token: ' + token)
        const url = this.baseUrl + '/certificates/' + encodeURIComponent(subdomain) + '/ip'
        const body: UpdateIpAndPortRequest = {
            token,
            sessionId,
            streamrWebSocketPort
        }
        await makeHttpRequest<undefined>('PUT', url, body)
    }
}
