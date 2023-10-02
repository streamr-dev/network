import { Session } from './data/Session'
import { CertifiedSubdomain } from './data/CertifiedSubdomain'
import request from 'request'
import { UpdateIpAndPortRequest } from './data/UpdateIpAndPortRequest'
import { CreateCertifiedSubdomainRequest } from './data/CreateCertifiedSubdomainRequest'
import { ServerError } from './errors'

export class RestClient {

    private baseUrl: string
    private caCert: string

    // the caCert MUST be hard-coded into the Streamr node config

    constructor(baseUrl: string, caCert: string) {
        this.baseUrl = baseUrl
        this.caCert = caCert
    }

    public async createSession(): Promise<string> {
        const url = this.baseUrl + '/sessions'
        const response = await this.post<Session>(url, {})
        return response.sessionId
    }

    public async createNewSubdomainAndCertificate(streamrWebSocketPort: number, sessionId: string): Promise<CertifiedSubdomain> {
        const url = this.baseUrl + '/certifiedSubdomains'
        const body: CreateCertifiedSubdomainRequest = {
            streamrWebSocketPort: streamrWebSocketPort,
            sessionId: sessionId
        }
        const response = await this.patch<CertifiedSubdomain>(url, body)
        return response
    }

    public async updateCertificate(subdomain: string, streamrWebSocketPort: number, sessioId: string, token: string): Promise<CertifiedSubdomain> {
        const url = this.baseUrl + '/subdomains/' + subdomain
        const body: UpdateIpAndPortRequest = {
            token: token,
            sessionId: sessioId,
            streamrWebSocketPort: streamrWebSocketPort
        }
        const response = await this.patch<CertifiedSubdomain>(url, body)
        return response
    }

    public async updateSubdomainIpAndPort(subdomain: string, streamrWebSocketPort: number, sessioId: string, token: string): Promise<void> {
        const url = this.baseUrl + '/certifiedsubdomains/' + subdomain + '/ip'
        const body: UpdateIpAndPortRequest = {
            token: token,
            sessionId: sessioId,
            streamrWebSocketPort: streamrWebSocketPort
        }
        await this.put<any>(url, body)
    }

    private async post<T>(url: string, body: any): Promise<T> {
        return new Promise((resolve, reject) => {
            request.post(url, { json: body, ca: this.caCert }, (error, response, body) => {
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

    private async put<T>(url: string, body: any): Promise<T> {
        return new Promise((resolve, reject) => {
            request.put(url, { json: body, ca: this.caCert }, (error, response, body) => {
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

    private async patch<T>(url: string, body: any): Promise<T> {
        return new Promise((resolve, reject) => {
            request.patch(url, { json: body, ca: this.caCert }, (error, response, body) => {
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
