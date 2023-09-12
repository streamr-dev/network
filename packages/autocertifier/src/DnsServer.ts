/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/parameter-properties, no-empty */

import { DnsHandler, DnsResponse, Packet, createServer } from 'dns2'
import { Database, Subdomain } from './Database'
import { Logger } from '@streamr/utils'

const logger = new Logger(module)

export class DnsServer {

    private server?: any

    constructor(private domainName: string, private ownHostName: string,
        private dnsServerPort: string, private ownIpAddress: string,
        private db: Database) {
    }

    public async createSubdomain(subdomain: string, ipAddress: string, port: string, token: string): Promise<void> {
        await this.db.createSubdomain(subdomain, ipAddress, port, token)
    }

    public async updateSubdomainIpAndPort(subdomain: string, ipAddress: string, port: string, token: string): Promise<void> {
        await this.db.updateSubdomainIpAndPort(subdomain, ipAddress, port, token)
    }

    public async updateSubdomainAcmeChallenge(subdomain: string, acmeChallenge: string): Promise<void> {
        await this.db.updateSubdomainAcmeChallenge(subdomain, acmeChallenge)
    }

    private handleSOAQuery = async (mixedCaseName: string, send: (response: DnsResponse) => void,
        response: DnsResponse): Promise<void> => {
        // @ts-ignore private field 
        response.answers.push({
            name: mixedCaseName,
            type: Packet.TYPE.SOA,
            class: Packet.CLASS.IN,
            ttl: 86400,
            primary: this.ownHostName + '.' + this.domainName,
            admin: 'admin.' + this.domainName,
            serial: 1,
            refresh: 86400,
            retry: 7200,
            expiration: 3600000,
            minimum: 172800,
        } as unknown)

        await send(response)
    }

    private handleNSQuery = async (mixedCaseName: string, send: (response: DnsResponse) => void,
        response: DnsResponse): Promise<void> => {
        // @ts-ignore private field 
        response.answers.push({
            name: mixedCaseName,
            type: Packet.TYPE.NS,
            class: Packet.CLASS.IN,
            ttl: 86400,
            ns: this.ownHostName + '.' + this.domainName
        } as unknown)

        await send(response)
    }

    private handleTextQuery = async (mixedCaseName: string, send: (response: DnsResponse) => void,
        response: DnsResponse): Promise<void> => {

        const name = mixedCaseName.toLowerCase()
        const parts = name.split('.')

        if (parts.length < 4 || parts[0] !== '_acme-challenge') {
            // @ts-ignore private field
            response.header.rcode = 3
            return send(response)
        }

        const subdomain = parts[1]

        let subdomainRecord: Subdomain | undefined
        try {
            subdomainRecord = await this.db.getSubdomain(subdomain)
        } catch (e) { }

        if (!subdomainRecord) {
            // @ts-ignore private field
            response.header.rcode = 3
            return send(response)
        }

        const acmeChallenge = subdomainRecord.acmeChallenge

        response.answers.push({
            name: mixedCaseName,
            type: Packet.TYPE.TXT,
            class: Packet.CLASS.IN,
            ttl: 300,
            data: acmeChallenge!
        })

        await send(response)
    }

    private handleNormalQuery = async (mixedCaseName: string, send: (response: DnsResponse) => void,
        response: DnsResponse): Promise<void> => {

        const name = mixedCaseName.toLowerCase()
        logger.info('handleNormalQuery() ' + name)
        
        const parts = name.split('.')
        
        if (parts.length < 3) {
            // @ts-ignore private field
            response.header.rcode = 3
            return send(response)
        }

        const subdomain = parts[0]

        let retIp = ''
        if (this.ownHostName === subdomain) {
            retIp = this.ownIpAddress
        } else {
            let subdomainRecord: Subdomain | undefined
            try {
                subdomainRecord = await this.db.getSubdomain(subdomain)
            } catch (e) { 
                logger.error('handleNormalQuery exception')
            }

            if (!subdomainRecord) {
                logger.info('handleNormalQuery() not found: ' + name)
                // @ts-ignore private field
                response.header.rcode = 3
                return send(response)
            }
            retIp = subdomainRecord.ip
        }

        response.answers.push({
            name: mixedCaseName,
            type: Packet.TYPE.A,
            class: Packet.CLASS.IN,
            ttl: 300,
            address: retIp
        })
        await send(response)
    }

    private handleQuery: DnsHandler = async (request, send, _rinfo): Promise<void> => {

        const response = Packet.createResponseFromRequest(request)
        // @ts-ignore private field
        response.header.aa = 1
        const question = request.questions[0]
        const mixedCaseName = question.name
        const name = mixedCaseName.toLowerCase()

        if (!name.endsWith(this.domainName)) {
            logger.warn('invalid domain name in query: ' + name)
            // @ts-ignore private field
            response.header.rcode = 3
            return send(response)
        }

        const parts = mixedCaseName.split('.')
        const mixedCaseDomainName = parts[parts.length - 2] + '.' + parts[parts.length - 1]

        // @ts-ignore private field
        if (question.type == Packet.TYPE.SOA) {
            return this.handleSOAQuery(mixedCaseDomainName, send, response)
            // @ts-ignore private field
        } else if (question.type == Packet.TYPE.NS) {
            return this.handleNSQuery(mixedCaseDomainName, send, response)
            // @ts-ignore private field
        } else if (question.type == Packet.TYPE.TXT) {
            return this.handleTextQuery(mixedCaseName, send, response)
        } else {
            return this.handleNormalQuery(mixedCaseName, send, response)
        }
    }

    public async start(): Promise<void> {
        this.server = createServer({
            udp: true,
            handle: this.handleQuery
        })

        return this.server.listen({ udp: { host: this.ownIpAddress, port: parseInt(this.dnsServerPort) } })
    }

    public async stop(): Promise<void> {
        if (this.server) {
            await this.server.close()
        }
    }
}
