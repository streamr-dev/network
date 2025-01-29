import { RestServer } from '../../src/RestServer'
import { CertifiedSubdomain, Session } from '@streamr/autocertifier-client'
import { v4 } from 'uuid'
import path from 'path'
import * as https from 'https'

//Allow self-signed certificates
const agent = new https.Agent({
    rejectUnauthorized: false
})

// Helper function for making HTTPS requests
const makeRequest = (url: string, options: https.RequestOptions, body?: any): Promise<{ status: number, body: any }> => {
    return new Promise((resolve, reject) => {
        const req = https.request(url, { ...options, agent }, (res) => {
            let data = ''
            res.on('data', (chunk) => data += chunk)
            res.on('end', () => {
                resolve({
                    status: res.statusCode!,
                    body: data !== undefined ? JSON.parse(data) : undefined
                })
            })
        })
        req.on('error', reject)
        if (body !== undefined) {
            req.write(JSON.stringify(body))
        }
        req.end()
    })
}

describe('RestServer', () => {
    let server: RestServer

    const certifiedSubdomain: CertifiedSubdomain = {
        fqdn: '127.0.0.1',
        authenticationToken: 'token',
        certificate: 'certificate',
        privateKey: 'key'
    }
    const sessionId = v4()

    beforeAll(async () => {
        server = new RestServer(
            '127.0.0.1',
            9877,
            path.join(__dirname, '../utils/self-signed-certs/certificate.pem'),
            path.join(__dirname, '../utils/self-signed-certs/key.pem'),
            {
                async createSession(): Promise<Session> {
                    return { id: sessionId }
                },
                async createNewSubdomainAndCertificate(): Promise<CertifiedSubdomain> {
                    return certifiedSubdomain
                },
                async createNewCertificateForSubdomain(): Promise<CertifiedSubdomain> {
                    return certifiedSubdomain
                },
                async updateSubdomainIp() {
                    // do nothing
                }
            })
        await server.start()
    })

    afterAll(async () => {
        await server.stop()
    })

    describe('POST /sessions', () => {
        it('should return session with sessionId', async () => {
            const response = await makeRequest('https://127.0.0.1:9877/sessions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            })

            expect(response.status).toEqual(200)
            expect(response.body).toEqual({ id: sessionId })
        })
    })

    describe('PATCH /certificates', () => {
        it('should return a certified subdomain', async () => {
            const response = await makeRequest('https://127.0.0.1:9877/certificates', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                }
            }, {
                streamrWebSocketPort: '1234'
            })

            expect(response.status).toEqual(200)
            expect(response.body).toEqual(certifiedSubdomain)
        })

        it('should return an error if streamrWebSocketPort is missing', async () => {
            const response = await makeRequest('https://127.0.0.1:9877/certificates', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                }
            }, {})

            expect(response.status).toEqual(400)
            expect(response.body.code).toEqual('STREAMR_WEBSOCKET_PORT_MISSING')
        })
    })

    describe('PUT /certificates/:subdomain/ip', () => {
        it('should update the subdomain IP and port', async () => {
            const response = await makeRequest('https://127.0.0.1:9877/certificates/test/ip', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                }
            }, {
                streamrWebSocketPort: '1234',
                token: 'token'
            })

            expect(response.status).toEqual(200)
            expect(response.body).toEqual({})
        })

        it('should return an error if streamrWebSocketPort is missing', async () => {
            const response = await makeRequest('https://127.0.0.1:9877/certificates/test/ip', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                }
            }, {
                token: 'token'
            })

            expect(response.status).toEqual(400)
            expect(response.body.code).toEqual('STREAMR_WEBSOCKET_PORT_MISSING')
        })

        it('should return an error if token is missing', async () => {
            const response = await makeRequest('https://127.0.0.1:9877/certificates/test/ip', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                }
            }, {
                streamrWebSocketPort: '1234'
            })

            expect(response.status).toEqual(400)
            expect(response.body.code).toEqual('TOKEN_MISSING')
        })
    })
})
