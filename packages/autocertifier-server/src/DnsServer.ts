/* eslint-disable @typescript-eslint/ban-ts-comment */

import { DnsHandler, DnsRequest, DnsResponse, Packet, createServer } from 'dns2'
import { Database, Subdomain } from './Database'
import { Logger } from '@streamr/utils'

type AsyncDnsHandler = (...args: Parameters<DnsHandler>) => Promise<void>

const logger = new Logger(module)

// https://help.dnsfilter.com/hc/en-us/articles/4408415850003-DNS-Return-Codes
// DNS Query Format Error
export const FORMERR = 1
// Domain name not exist
export const NXDOMAIN = 3

// TODO: there is appears to be a general problem with typing in this class. Seems that the DNS2 library does
// not provide proper typing for many fields and response types. Alternativel we should just simply send all
// responses as the DnsResponse type instead of unknown
// TODO: which DNS query types should we support? A query is the most important one and it works.
// However the others do not appear to work as intended at least based on DNS queries.
export class DnsServer {
    private server?: any
    private readonly domainName: string
    private readonly ownHostName: string
    private readonly port: number
    private readonly ownIpAddress: string
    private readonly db: Database

    constructor(domainName: string, ownHostName: string, port: number, ownIpAddress: string, db: Database) {
        this.domainName = domainName
        this.ownHostName = ownHostName
        this.port = port
        this.ownIpAddress = ownIpAddress
        this.db = db
    }

    private handleSOAQuery = async (
        mixedCaseName: string,
        send: (response: DnsResponse) => void,
        response: DnsResponse
    ): Promise<void> => {
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
            minimum: 172800
        } as unknown)
        send(response)
    }

    private handleNSQuery = async (
        mixedCaseName: string,
        send: (response: DnsResponse) => void,
        response: DnsResponse
    ): Promise<void> => {
        // @ts-ignore private field
        response.answers.push({
            name: mixedCaseName,
            type: Packet.TYPE.NS,
            class: Packet.CLASS.IN,
            ttl: 86400,
            ns: this.ownHostName + '.' + this.domainName
        } as unknown)
        send(response)
    }

    private handleTextQuery = async (
        mixedCaseName: string,
        send: (response: DnsResponse) => void,
        response: DnsResponse
    ): Promise<void> => {
        const name = mixedCaseName.toLowerCase()
        logger.info('handleTextQuery() ' + name)

        const parts = name.split('.')

        if (parts.length < 4 || parts[0] !== '_acme-challenge') {
            // @ts-ignore private field
            response.header.rcode = FORMERR
            send(response)
            return
        }

        const subdomain = parts[1]

        let subdomainRecord: Subdomain | undefined
        try {
            subdomainRecord = await this.db.getSubdomain(subdomain)
        } catch (e) {
            logger.error('handleTextQuery exception, subdomain record not found ' + e)
        }

        if (!subdomainRecord) {
            // @ts-ignore private field
            response.header.rcode = NXDOMAIN
            send(response)
            return
        }

        const acmeChallenge = subdomainRecord.acmeChallenge

        logger.info('handleTextQuery() sending back acme challenge ' + acmeChallenge + ' for ' + mixedCaseName)
        response.answers.push({
            name: mixedCaseName,
            type: Packet.TYPE.TXT,
            class: Packet.CLASS.IN,
            ttl: 300,
            data: acmeChallenge!
        })
        send(response)
    }

    // eslint-disable-next-line class-methods-use-this
    private handleAAAAQuery = async (
        mixedCaseName: string,
        send: (response: DnsResponse) => void,
        response: DnsResponse
    ): Promise<void> => {
        logger.info('handleAAAAQuery() ' + mixedCaseName)
        send(response)
    }

    // eslint-disable-next-line class-methods-use-this
    private handleCNAMEQuery = async (
        mixedCaseName: string,
        send: (response: DnsResponse) => void,
        response: DnsResponse
    ): Promise<void> => {
        logger.info('handleCNAMEQuery() ' + mixedCaseName)
        send(response)
    }

    // eslint-disable-next-line class-methods-use-this
    private handleCAAQuery = async (
        mixedCaseName: string,
        send: (response: DnsResponse) => void,
        response: DnsResponse
    ): Promise<void> => {
        logger.info('handleCAAQuery() ' + mixedCaseName)
        send(response)
    }

    private handleAQuery = async (
        mixedCaseName: string,
        send: (response: DnsResponse) => void,
        response: DnsResponse
    ): Promise<void> => {
        const name = mixedCaseName.toLowerCase()
        logger.info('handleAQuery() ' + name)

        const parts = name.split('.')

        if (parts.length < 3) {
            // @ts-ignore private field
            response.header.rcode = NXDOMAIN
            send(response)
            return
        }

        const subdomain = parts[0]

        let retIp = ''
        if (this.ownHostName === subdomain) {
            retIp = this.ownIpAddress
        } else {
            let subdomainRecord: Subdomain | undefined
            try {
                subdomainRecord = await this.db.getSubdomain(subdomain)
            } catch {
                logger.error('handleAQuery exception')
            }

            if (!subdomainRecord) {
                logger.info('handleAQuery() not found: ' + name)
                // @ts-ignore private field
                response.header.rcode = NXDOMAIN
                send(response)
                return
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
        send(response)
    }

    private handleQuery: AsyncDnsHandler = async (
        request: DnsRequest,
        send: (response: DnsResponse) => void
    ): Promise<void> => {
        const response = Packet.createResponseFromRequest(request)
        // @ts-ignore private field
        response.header.aa = 1
        const question = request.questions[0]
        if (question?.name === undefined) {
            logger.debug('filtering invalid question')
            // @ts-ignore private field
            response.header.rcode = FORMERR
            send(response)
            return
        }
        const mixedCaseName = question.name
        const name = mixedCaseName.toLowerCase()

        if (!name.endsWith(this.domainName)) {
            logger.debug('invalid domain name in query: ' + name)
            // @ts-ignore private field
            response.header.rcode = NXDOMAIN
            send(response)
            return
        }

        const parts = mixedCaseName.split('.')
        const mixedCaseDomainName = parts[parts.length - 2] + '.' + parts[parts.length - 1]

        // TODO: Why DNS2 typing does not expose question.type? The code appears to works and process different
        // query types correctly.
        // @ts-ignore private field
        logger.info(mixedCaseDomainName + ' question type 0x' + Number(question.type).toString(16))
        // @ts-ignore private field
        if (question.type === Packet.TYPE.SOA) {
            return this.handleSOAQuery(mixedCaseDomainName, send, response)
            // @ts-ignore private field
        } else if (question.type === Packet.TYPE.NS) {
            return this.handleNSQuery(mixedCaseDomainName, send, response)
            // @ts-ignore private field
        } else if (question.type === Packet.TYPE.TXT) {
            return this.handleTextQuery(mixedCaseName, send, response)
            // @ts-ignore private field
        } else if (question.type === Packet.TYPE.AAAA) {
            return this.handleAAAAQuery(mixedCaseName, send, response)
            // @ts-ignore private field
        } else if (question.type === Packet.TYPE.CNAME) {
            return this.handleCNAMEQuery(mixedCaseName, send, response)
            // @ts-ignore private field
        } else if (question.type === Packet.TYPE.CAA) {
            return this.handleCAAQuery(mixedCaseName, send, response)
            // @ts-ignore private field
        } else if (question.type === Packet.TYPE.A) {
            return this.handleAQuery(mixedCaseName, send, response)
        } else {
            // @ts-ignore private field
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            logger.warn(`Unsupported query type ${question.type}`)
        }
    }

    public async start(): Promise<void> {
        this.server = createServer({
            udp: true,
            handle: this.handleQuery
        })

        return this.server.listen({ udp: { host: this.ownIpAddress, port: this.port } })
    }

    public async stop(): Promise<void> {
        await this.server.close()
    }
}
