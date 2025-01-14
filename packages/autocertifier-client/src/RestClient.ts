import { Session } from './data/Session'
import { CertifiedSubdomain } from './data/CertifiedSubdomain'
import request, { Response } from 'request'
import { UpdateIpAndPortRequest } from './data/UpdateIpAndPortRequest'
import { CreateCertifiedSubdomainRequest } from './data/CreateCertifiedSubdomainRequest'
import { ServerError } from './errors'
import { Logger } from '@streamr/utils'

const logger = new Logger(module)

// TODO: use a non-deprecated HTTP client that support async/await instead of request
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
            const response = await this.post<Session>(url, {})
            return response.id
        } catch (err) {
            logger.debug(err)
            throw err
        }
    }

    public async createSubdomainAndCertificate(
        streamrWebSocketPort: number,
        sessionId: string
    ): Promise<CertifiedSubdomain> {
        const url = this.baseUrl + '/certificates'
        const body: CreateCertifiedSubdomainRequest = {
            streamrWebSocketPort,
            sessionId
        }
        const response = await this.patch<CertifiedSubdomain>(url, body, 2 * 60 * 1000)
        return response
    }

    public async updateCertificate(
        subdomain: string,
        streamrWebSocketPort: number,
        sessionId: string,
        token: string
    ): Promise<CertifiedSubdomain> {
        const url = this.baseUrl + '/certificates/' + encodeURIComponent(subdomain)
        const body: UpdateIpAndPortRequest = {
            token,
            sessionId,
            streamrWebSocketPort
        }
        const response = await this.patch<CertifiedSubdomain>(url, body)
        return response
    }

    public async updateSubdomainIp(
        subdomain: string,
        streamrWebSocketPort: number,
        sessionId: string,
        token: string
    ): Promise<void> {
        logger.debug(
            'updateSubdomainIp() subdomain: ' +
                subdomain +
                ', streamrWebSocketPort:  ' +
                streamrWebSocketPort +
                ', sessionId: ' +
                sessionId +
                ', token: ' +
                token
        )
        const url = this.baseUrl + '/certificates/' + encodeURIComponent(subdomain) + '/ip'
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
            request.post(
                url,
                { json: body, rejectUnauthorized: false },
                (error: any, response: Response, body: any) => {
                    if (error) {
                        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
                        reject(error)
                    } else if (response.statusCode >= 200 && response.statusCode < 300) {
                        resolve(body)
                    } else {
                        reject(new ServerError(body))
                    }
                }
            )
        })
    }

    // eslint-disable-next-line class-methods-use-this
    private put<T>(url: string, body: any): Promise<T> {
        return new Promise((resolve, reject) => {
            request.put(url, { json: body, rejectUnauthorized: false }, (error: any, response: Response, body: any) => {
                if (error) {
                    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
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
    private patch<T>(url: string, body: any, timeout?: number): Promise<T> {
        return new Promise((resolve, reject) => {
            request.patch(
                url,
                { json: body, rejectUnauthorized: false, timeout },
                (error: any, response: Response, body: any) => {
                    if (error) {
                        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
                        reject(error)
                    } else if (response.statusCode >= 200 && response.statusCode < 300) {
                        resolve(body)
                    } else {
                        reject(new ServerError(body))
                    }
                }
            )
        })
    }
}
