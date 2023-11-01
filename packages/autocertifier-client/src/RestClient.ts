import { Session } from './data/Session'
import { CertifiedSubdomain } from './data/CertifiedSubdomain'
import request from 'request'
import { UpdateIpAndPortRequest } from './data/UpdateIpAndPortRequest'
import { CreateCertifiedSubdomainRequest } from './data/CreateCertifiedSubdomainRequest'
import { ServerError } from './errors'
import { Logger } from '@streamr/utils'

const logger = new Logger(module)

// TODO: use a non-deprecated HTTP client that support async/await instead of request
export class RestClient {

    private baseUrl: string

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl
    }

    public async createSession(): Promise<string> {
        const url = this.baseUrl + '/sessions'
        try {
            const response = await this.post<Session>(url, {})
            return response.sessionId
        } catch (err) {
            logger.debug(err)
            throw err
        }
    }

    public async createNewSubdomainAndCertificate(streamrWebSocketPort: number, sessionId: string): Promise<CertifiedSubdomain> {
        const url = this.baseUrl + '/certified-subdomains'
        const body: CreateCertifiedSubdomainRequest = {
            streamrWebSocketPort,
            sessionId
        }
        const response = await this.patch<CertifiedSubdomain>(url, body)
        return response
    }

    public async updateCertificate(subdomain: string, streamrWebSocketPort: number, sessionId: string, token: string): Promise<CertifiedSubdomain> {
        const url = this.baseUrl + '/certified-subdomains/' + encodeURIComponent(subdomain)
        const body: UpdateIpAndPortRequest = {
            token,
            sessionId,
            streamrWebSocketPort
        }
        const response = await this.patch<CertifiedSubdomain>(url, body)
        return response
    }

    public async updateSubdomainIpAndPort(subdomain: string, streamrWebSocketPort: number, sessionId: string, token: string): Promise<void> {
        logger.debug('updateSubdomainIpAndPort() subdomain: ' + subdomain + ', streamrWebSocketPort:  ' + streamrWebSocketPort
            + ', sessionId: ' + sessionId + ', token: ' + token)
        const url = this.baseUrl + '/certified-subdomains/' + encodeURIComponent(subdomain) + '/ip'
        const body: UpdateIpAndPortRequest = {
            token,
            sessionId,
            streamrWebSocketPort
        }
        await this.put<any>(url, body)
    }

    // eslint-disable-next-line class-methods-use-this
    private post<T>(url: string, body: any): Promise<T> {
        return new Promise((resolve, reject) => {
            request.post(url, { json: body, rejectUnauthorized: false }, (error, response, body) => {
                if (error) {
                    reject(error)
                } else if (response.statusCode >= 200 && response.statusCode < 300) {
                    resolve(body)
                } else {
                    reject(new ServerError(body))
                }
            })
        })
    }

    // eslint-disable-next-line class-methods-use-this
    private put<T>(url: string, body: any): Promise<T> {
        return new Promise((resolve, reject) => {
            request.put(url, { json: body, rejectUnauthorized: false }, (error, response, body) => {
                if (error) {
                    reject(error)
                } else if (response.statusCode >= 200 && response.statusCode < 300) {
                    resolve(body)
                } else {
                    reject(new ServerError(body))
                }
            })
        })
    }

    // eslint-disable-next-line class-methods-use-this
    private patch<T>(url: string, body: any): Promise<T> {
        return new Promise((resolve, reject) => {
            request.patch(url, { json: body, rejectUnauthorized: false }, (error, response, body) => {
                if (error) {
                    reject(error)
                } else if (response.statusCode >= 200 && response.statusCode < 300) {
                    resolve(body)
                } else {
                    reject(new ServerError(body))
                }
            })
        })
    }
}
