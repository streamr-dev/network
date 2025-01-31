import { RestServer } from '../../src/RestServer'
import { request, CertifiedSubdomain, Session } from '@streamr/autocertifier-client'
import { v4 } from 'uuid'
import path from 'path'

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
            const response = await request<Session>('POST', 'https://127.0.0.1:9877/sessions', {})
            expect(response).toEqual({ id: sessionId })
        })
    })

    describe('PATCH /certificates', () => {
        it('should return a certified subdomain', async () => {
            const response = await request<CertifiedSubdomain>('PATCH', 'https://127.0.0.1:9877/certificates', {
                streamrWebSocketPort: '1234'
            })
            expect(response).toEqual(certifiedSubdomain)
        })

        it('should return an error if streamrWebSocketPort is missing', async () => {
            try {
                await request<CertifiedSubdomain>('PATCH', 'https://127.0.0.1:9877/certificates', {})
                fail('Should have thrown')
            } catch (err: any) {
                expect(err.code).toEqual('STREAMR_WEBSOCKET_PORT_MISSING')
                expect(err.httpStatus).toEqual(400)
            }
        })
    })

    describe('PUT /certificates/:subdomain/ip', () => {
        it('should update the subdomain IP and port', async () => {
            const response = await request('PUT', 'https://127.0.0.1:9877/certificates/test/ip', {
                streamrWebSocketPort: '1234',
                token: 'token'
            })
            expect(response).toEqual({})
        })

        it('should return an error if streamrWebSocketPort is missing', async () => {
            try {
                await request<undefined>('PUT', 'https://127.0.0.1:9877/certificates/test/ip', {
                    token: 'token'
                })
                fail('Should have thrown')
            } catch (err: any) {
                expect(err.code).toEqual('STREAMR_WEBSOCKET_PORT_MISSING')
                expect(err.httpStatus).toEqual(400)
            }
        })

        it('should return an error if token is missing', async () => {
            try {
                await request<undefined>('PUT', 'https://127.0.0.1:9877/certificates/test/ip', {
                    streamrWebSocketPort: '1234'
                })
                fail('Should have thrown')
            } catch (err: any) {
                expect(err.code).toEqual('TOKEN_MISSING')
                expect(err.httpStatus).toEqual(400)
            }
        })
    })
})
