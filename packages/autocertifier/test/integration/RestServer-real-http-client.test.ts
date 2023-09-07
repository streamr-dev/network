import request from 'request'
import { RestServer } from '../../src/RestServer'
import { CertifiedSubdomain } from '../../src/data/CertifiedSubdomain'
import { ApiError } from '../../src/data/ApiError'

describe('RestServer', () => {
    let server: RestServer

    const certifiedSubdomain: CertifiedSubdomain = { subdomain: 'test', token: 'token', certificate: { cert: 'certificate', key: 'key' } }
    beforeAll(async () => {
        server = new RestServer('3000', {
            async createNewSubdomainAndCertificate(_ip: string, _port: string, _streamrWebsocketPort: string): Promise<CertifiedSubdomain> {
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
    })

    afterAll(async () => {
        await server.stop()
    })

    describe('PATCH /certifiedsubdomains', () => {
        it('should return a certified subdomain', (done) => {
            const options = {
                url: 'http://localhost:3000/certifiedsubdomains',
                method: 'PATCH',
                json: {
                    streamrWebSocketPort: '1234'
                }
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
                url: 'http://localhost:3000/certifiedsubdomains',
                method: 'PATCH',
                json: true
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

    describe('PUT /certifiedsubdomains/:subdomain/ip', () => {
        it('should update the subdomain IP and port', (done) => {
            const options = {
                url: 'http://localhost:3000/certifiedsubdomains/test/ip',
                method: 'PUT',
                json: {
                    streamrWebSocketPort: '1234',
                    token: 'token'
                }
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
                url: 'http://localhost:3000/certifiedsubdomains/test/ip',
                method: 'PUT',
                json: {
                    token: 'token'
                }
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
                url: 'http://localhost:3000/certifiedsubdomains/test/ip',
                method: 'PUT',
                json: {
                    streamrWebSocketPort: '1234'
                }
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
