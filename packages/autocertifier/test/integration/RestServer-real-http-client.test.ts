import request from 'request'
import { RestServer } from '../../src/RestServer'
import { CertifiedSubdomain } from '@streamr/autocertifier-client'
import { ApiError } from '@streamr/autocertifier-client'
import os from 'os'
import fs from 'fs'
import { Session } from '@streamr/autocertifier-client'
import { v4 } from 'uuid'

describe('RestServer', () => {
    let server: RestServer
    const dir = os.tmpdir()
    let ca: string

    const certifiedSubdomain: CertifiedSubdomain = {
        fqdn: 'localhost',
        subdomain: 'fwefwafeaw',
        token: 'token',
        certificate: {
            cert: 'certificate',
            key: 'key'
        }
    }
    const sessionId = v4()

    beforeAll(async () => {

        server = new RestServer('localhost', 'localhost', '3000', dir + '/restServerCaCert.pem', dir + '/restServerCaKey.pem',
            dir + '/restServerCert.pem', dir + '/restServerKey.pem', {
                async createSession(): Promise<Session> {
                    return { sessionId: sessionId }
                },
                async createNewSubdomainAndCertificate(_ip: string, _port: string, _streamrWebsocketPort: string,
                    _streamrWebSocketCaCert: string | undefined, _sessionId: string): Promise<CertifiedSubdomain> {
                    return certifiedSubdomain
                },
                async createNewCertificateForSubdomain(_subdomain: string, _ipAddress: string,
                    _port: string, _streamrWebSocketPort: string, _token: string): Promise<CertifiedSubdomain> {

                    return certifiedSubdomain
                },
                async updateSubdomainIpAndPort(_subdomain: string, _ip: string, _port: string, _streamrWebsocketPort: string, _token: string) {
                    // do nothing
                }
            })
        await server.start()
        ca = fs.readFileSync(dir + '/restServerCaCert.pem', 'utf8')
    })

    afterAll(async () => {
        await server.stop()
    })

    describe('POST /sessions', () => {
        it('should return session with sessionId', (done) => {
            const options = {
                url: 'https://localhost:3000/sessions',
                method: 'POST',
                json: true,
                ca: ca
            }

            request(options, (error, response, body) => {
                expect(error).toBeFalsy()
                expect(response.statusCode).toEqual(200)
                expect(body).toEqual({ sessionId: sessionId })
                done()
            })
        })
    })

    describe('PATCH /certified-subdomains', () => {
        it('should return a certified subdomain', (done) => {
            const options = {
                url: 'https://localhost:3000/certified-subdomains',
                method: 'PATCH',
                json: {
                    streamrWebSocketPort: '1234'
                },
                ca: ca
            }

            request(options, (error, response, body) => {
                expect(error).toBeFalsy()
                expect(response.statusCode).toEqual(200)
                expect(body).toEqual(certifiedSubdomain)
                done()
            })
        })

        it('should return an error if streamrWebSocketPort is missing', (done) => {
            const options = {
                url: 'https://localhost:3000/certified-subdomains',
                method: 'PATCH',
                json: true,
                ca: ca
            }

            request(options, (error, response, body) => {
                expect(error).toBeFalsy()
                expect(response.statusCode).toEqual(400)
                const responseBody = body as ApiError
                expect(responseBody.code).toEqual('STREAMR_WEBSOCKET_PORT_MISSING')
                done()
            })
        })
    })

    describe('PUT /certified-subdomains/:subdomain/ip', () => {
        it('should update the subdomain IP and port', (done) => {
            const options = {
                url: 'https://localhost:3000/certified-subdomains/test/ip',
                method: 'PUT',
                json: {
                    streamrWebSocketPort: '1234',
                    token: 'token'
                },
                ca: ca
            }

            request(options, (error, response, body) => {
                expect(error).toBeFalsy()
                expect(response.statusCode).toEqual(200)
                expect(body).toEqual({})
                done()
            })
        })

        it('should return an error if streamrWebSocketPort is missing', (done) => {
            const options = {
                url: 'https://localhost:3000/certified-subdomains/test/ip',
                method: 'PUT',
                json: {
                    token: 'token'
                },
                ca: ca
            }

            request(options, (error, response, body) => {
                expect(error).toBeFalsy()
                expect(response.statusCode).toEqual(400)
                const responseBody = body as ApiError
                expect(responseBody.code).toEqual('STREAMR_WEBSOCKET_PORT_MISSING')
                done()
            })
        })

        it('should return an error if token is missing', (done) => {
            const options = {
                url: 'https://localhost:3000/certified-subdomains/test/ip',
                method: 'PUT',
                json: {
                    streamrWebSocketPort: '1234'
                },
                ca: ca
            }

            request(options, (error, response, body) => {
                expect(error).toBeFalsy()
                expect(response.statusCode).toEqual(400)
                const responseBody = body as ApiError
                expect(responseBody.code).toEqual('TOKEN_MISSING')
                done()
            })
        })
    })
})
