import { Session } from './data/Session'
import { CertifiedSubdomain } from './data/CertifiedSubdomain'
import { UpdateIpAndPortRequest } from './data/UpdateIpAndPortRequest'
import { CreateCertifiedSubdomainRequest } from './data/CreateCertifiedSubdomainRequest'
import { Err, ErrorCode, ServerError } from './errors'
import { Logger } from '@streamr/utils'

const logger = new Logger(module)

async function post<T>(url: string, body: any): Promise<T> {
    return request<T>('POST', url, body)
}

async function put<T>(url: string, body: any): Promise<T> {
    return request<T>('PUT', url, body)
}

async function patch<T>(url: string, body: any, timeout?: number): Promise<T> {
    return request<T>('PATCH', url, body, timeout)
}

async function request<T>(method: string, url: string, body: any, timeout?: number): Promise<T> {
    const signal = timeout !== undefined ? AbortSignal.timeout(timeout) : undefined

    const response = await fetch(url, {
        method,
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
        signal
    })

    const responseBody = await response.json() as T

    if (response.ok) {
        return responseBody
    } else {
        throw new ServerError(new Err(ErrorCode.SERVER_ERROR, response.status, JSON.stringify(response.body)))
    }
}

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
            const response = await post<Session>(url, {})
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
        return await patch<CertifiedSubdomain>(url, body, 2 * 60 * 1000)
    }

    public async updateCertificate(subdomain: string, streamrWebSocketPort: number, sessionId: string, token: string): Promise<CertifiedSubdomain> {
        const url = this.baseUrl + '/certificates/' + encodeURIComponent(subdomain)
        const body: UpdateIpAndPortRequest = {
            token,
            sessionId,
            streamrWebSocketPort
        }
        return await patch<CertifiedSubdomain>(url, body)
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
        await put<undefined>(url, body)
    }
}
