/* eslint-disable @typescript-eslint/ban-ts-comment */

import { DnsServer, NXDOMAIN, FORMERR } from '../../src/DnsServer'
import { Database } from '../../src/Database'
import { MockProxy, mock } from 'jest-mock-extended'

describe('DnsServer', () => {
    let dnsServer: DnsServer
    let db: MockProxy<Database>
    beforeEach(() => {
        db = mock<Database>()
        dnsServer = new DnsServer('example.com', 'ns1', 9878, '127.0.0.1', db)
    })

    describe('handleSOAQuery', () => {
        it('should add SOA record to response', async () => {
            const response = {
                answers: []
            } as any
            const send = jest.fn()

            // @ts-ignore private field

            await dnsServer.handleSOAQuery('example.com', send, response)

            expect(response.answers).toHaveLength(1)
            expect(response.answers[0].type).toBe(6)
        })
    })

    describe('handleTextQuery', () => {
        it('should return acme challenge for valid subdomain', async () => {
            const response = {
                header: {},
                answers: []
            } as any
            const send = jest.fn()
            const subdomainRecord = {
                acmeChallenge: 'test-challenge'
            }
            // @ts-ignore private field
            db.getSubdomain.mockResolvedValue(subdomainRecord)

            // @ts-ignore private field
            await dnsServer.handleTextQuery('_acme-challenge.423423423.example.com', send, response)

            expect(response.answers).toHaveLength(1)
            expect(response.answers[0].type).toBe(16)
            expect(response.answers[0].data).toBe('test-challenge')
        })

        it('should return error for invalid subdomain', async () => {
            const response = {
                header: {},
                answers: []
            } as any
            const send = jest.fn()
            db.getSubdomain.mockResolvedValue(undefined)

            // @ts-ignore private field
            await dnsServer.handleTextQuery('_acme-challenge.invalid.com', send, response)

            expect(response.header.rcode).toBe(FORMERR)
            expect(response.answers).toHaveLength(0)
        })
    })

    describe('handleAQuery', () => {
        it('should return IP address for valid subdomain', async () => {
            const response = {
                header: {},
                answers: []
            } as any
            const send = jest.fn()
            const subdomainRecord = {
                ip: '127.0.0.1'
            }
            // @ts-ignore private field
            db.getSubdomain.mockResolvedValue(subdomainRecord)

            // @ts-ignore private field
            await dnsServer.handleAQuery('test.example.com', send, response)

            expect(response.answers).toHaveLength(1)
            expect(response.answers[0].type).toBe(1)
            expect(response.answers[0].address).toBe('127.0.0.1')
        })

        it('should return error for invalid subdomain', async () => {
            const response = {
                header: {},
                answers: []
            } as any
            const send = jest.fn()
            db.getSubdomain.mockResolvedValue(undefined)

            // @ts-ignore private field
            await dnsServer.handleAQuery('invalid.com', send, response)

            expect(response.header.rcode).toBe(NXDOMAIN)
            expect(response.answers).toHaveLength(0)
        })
    })

    describe('handleQuery', () => {
        it('should handle SOA query', async () => {
            const request = {
                questions: [
                    {
                        name: 'example.com',
                        type: 6
                    }
                ]
            } as any

            const send = jest.fn()

            // @ts-ignore private field
            await dnsServer.handleQuery(request, send, undefined)

            expect(send).toHaveBeenCalled()
            expect(send.mock.calls[0][0].answers).toHaveLength(1)
            expect(send.mock.calls[0][0].answers[0].type).toBe(6)
        })

        it('should handle TXT query', async () => {
            const request = {
                questions: [
                    {
                        name: '_acme-challenge.42342.example.com',
                        type: 16
                    }
                ]
            } as any

            const send = jest.fn()
            const subdomainRecord = {
                acmeChallenge: 'test-challenge'
            }
            // @ts-ignore private field
            db.getSubdomain.mockResolvedValue(subdomainRecord)
            // @ts-ignore private field
            await dnsServer.handleQuery(request, send, null)

            expect(send).toHaveBeenCalled()
            expect(send.mock.calls[0][0].answers).toHaveLength(1)
            expect(send.mock.calls[0][0].answers[0].type).toBe(16)
            expect(send.mock.calls[0][0].answers[0].data).toBe('test-challenge')
        })

        it('should handle normal query', async () => {
            const request = {
                questions: [
                    {
                        name: 'test.example.com',
                        type: 1
                    }
                ]
            } as any

            const send = jest.fn()
            const subdomainRecord = {
                ip: '127.0.0.1'
            }
            // @ts-ignore private field
            db.getSubdomain.mockResolvedValue(subdomainRecord)
            // @ts-ignore private field
            await dnsServer.handleQuery(request, send, null)

            expect(send).toHaveBeenCalled()
            expect(send.mock.calls[0][0].answers).toHaveLength(1)
            expect(send.mock.calls[0][0].answers[0].type).toBe(1)
            expect(send.mock.calls[0][0].answers[0].address).toBe('127.0.0.1')
        })

        it('should handle invalid domain name', async () => {
            const request = {
                questions: [
                    {
                        name: 'invalid.com',
                        type: 1
                    }
                ]
            } as any

            const send = jest.fn()

            // @ts-ignore private field
            await dnsServer.handleQuery(request, send, null)

            expect(send).toHaveBeenCalled()
            expect(send.mock.calls[0][0].header.rcode).toBe(NXDOMAIN)
            expect(send.mock.calls[0][0].answers).toHaveLength(0)
        })
    })
})
