import { DnsServer } from '../../src/DnsServer'
import { Database } from '../../src/Database'
import { promisify } from 'util'
import dns from 'dns'
import fs from 'fs'

const db = new Database('/tmp/autocertifier-test.db')
let dnsServer: DnsServer
const ownIp = '127.0.0.1'

beforeAll(async () => {
    dns.setServers(['127.0.0.1:9876'])
    await db.start()
    dnsServer = new DnsServer('example.com', 'ns1', 9876, ownIp, db)
    await dnsServer.start()

    await db.createSubdomain('www', '1.2.3.4', '80', 'wfewfweafe')
    await db.createSubdomain('mail', '5.6.7.8', '25', 'geegreaegrge')
    await db.updateSubdomainAcmeChallenge('www', 'abc123')
})

afterAll(async () => {
    await dnsServer.stop()
    await db.stop()
    fs.unlinkSync('/tmp/autocertifier-test.db')
})

describe('DnsServer', () => {
    describe('handleAQuery', () => {
        it('should return the IP address for a valid subdomain', async () => {
            const ipAddress = await promisify(dns.resolve4)('www.example.com')
            expect(ipAddress).toEqual(['1.2.3.4'])
        })

        it('should fail with enotfound for an invalid subdomain', async () => {
            await expect(promisify(dns.resolve4)('foo.example.com')).rejects.toThrow('ENOTFOUND')
        })
    })

    describe('handleTextQuery', () => {
        it('should return the ACME challenge for a valid subdomain', async () => {
            const acmeChallenge = await promisify(dns.resolveTxt)('_acme-challenge.www.example.com')
            expect(acmeChallenge).toEqual([['abc123']])
        })

        it('should fail with enotfound for an invalid subdomain', async () => {
            await expect(promisify(dns.resolveTxt)('_acme-challenge.foo.example.com')).rejects.toThrow('ENOTFOUND')
        })
    })

    describe('handleSOAQuery', () => {
        it('should return an SOA record for the domain', async () => {
            const soaRecord = await promisify(dns.resolveSoa)('example.com')
            expect(soaRecord).toEqual({
                nsname: 'ns1.example.com',
                hostmaster: 'admin.example.com',
                serial: 1,
                refresh: 86400,
                retry: 7200,
                expire: 3600000,
                minttl: 172800
            })
        })
    })

    describe('handleNSQuery', () => {
        it('should return an NS record for the domain', async () => {
            const nsRecord = await promisify(dns.resolveNs)('example.com')
            expect(nsRecord).toEqual(['ns1.example.com'])
        })
    })

    describe('handleQuery', () => {
        it('should handle a normal query', async () => {
            const ipAddress = await promisify(dns.resolve4)('www.example.com')
            expect(ipAddress).toEqual(['1.2.3.4'])
        })

        it('should handle a query for own hostname', async () => {
            const ipAddress = await promisify(dns.resolve4)('ns1.example.com')
            expect(ipAddress).toEqual([ownIp])
        })

        it('should handle a TXT query', async () => {
            const acmeChallenge = await promisify(dns.resolveTxt)('_acme-challenge.www.example.com')
            expect(acmeChallenge).toEqual([['abc123']])
        })

        it('should handle an SOA query', async () => {
            const soaRecord = await promisify(dns.resolveSoa)('example.com')
            expect(soaRecord).toEqual({
                nsname: 'ns1.example.com',
                hostmaster: 'admin.example.com',
                serial: 1,
                refresh: 86400,
                retry: 7200,
                expire: 3600000,
                minttl: 172800
            })
        })

        it('should handle a query for an invalid domain', async () => {
            await expect(promisify(dns.resolve4)('wewfwefew.fe')).rejects.toThrow('ENOTFOUND')
        })
    })
})
