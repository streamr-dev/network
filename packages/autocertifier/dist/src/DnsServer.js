"use strict";
/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/parameter-properties, no-empty */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DnsServer = void 0;
const dns2_1 = require("dns2");
const utils_1 = require("@streamr/utils");
const logger = new utils_1.Logger(module);
class DnsServer {
    constructor(domainName, ownHostName, dnsServerPort, ownIpAddress, db) {
        this.domainName = domainName;
        this.ownHostName = ownHostName;
        this.dnsServerPort = dnsServerPort;
        this.ownIpAddress = ownIpAddress;
        this.db = db;
        this.handleSOAQuery = async (mixedCaseName, send, response) => {
            // @ts-ignore private field 
            response.answers.push({
                name: mixedCaseName,
                type: dns2_1.Packet.TYPE.SOA,
                class: dns2_1.Packet.CLASS.IN,
                ttl: 86400,
                primary: this.ownHostName + '.' + this.domainName,
                admin: 'admin.' + this.domainName,
                serial: 1,
                refresh: 86400,
                retry: 7200,
                expiration: 3600000,
                minimum: 172800,
            });
            await send(response);
        };
        this.handleNSQuery = async (mixedCaseName, send, response) => {
            // @ts-ignore private field 
            response.answers.push({
                name: mixedCaseName,
                type: dns2_1.Packet.TYPE.NS,
                class: dns2_1.Packet.CLASS.IN,
                ttl: 86400,
                ns: this.ownHostName + '.' + this.domainName
            });
            await send(response);
        };
        this.handleTextQuery = async (mixedCaseName, send, response) => {
            const name = mixedCaseName.toLowerCase();
            logger.info('handleTextQuery() ' + name);
            const parts = name.split('.');
            if (parts.length < 4 || parts[0] !== '_acme-challenge') {
                // @ts-ignore private field
                response.header.rcode = 3;
                return send(response);
            }
            const subdomain = parts[1];
            let subdomainRecord;
            try {
                subdomainRecord = await this.db.getSubdomain(subdomain);
            }
            catch (e) {
                logger.error('handleTextQuery exception, subdomain record not found ' + e);
            }
            if (!subdomainRecord) {
                // @ts-ignore private field
                response.header.rcode = 3;
                return send(response);
            }
            const acmeChallenge = subdomainRecord.acmeChallenge;
            logger.info('handleTextQuery() sending back acme challenge ' + acmeChallenge + ' for ' + mixedCaseName);
            response.answers.push({
                name: mixedCaseName,
                type: dns2_1.Packet.TYPE.TXT,
                class: dns2_1.Packet.CLASS.IN,
                ttl: 300,
                data: acmeChallenge
            });
            await send(response);
        };
        this.handleAAAAQuery = async (mixedCaseName, send, response) => {
            logger.info('handleAAAAQuery() ' + mixedCaseName);
            await send(response);
        };
        this.handleCNAMEQuery = async (mixedCaseName, send, response) => {
            logger.info('handleCNAMEQuery() ' + mixedCaseName);
            await send(response);
        };
        this.handleCAAQuery = async (mixedCaseName, send, response) => {
            logger.info('handleCAAQuery() ' + mixedCaseName);
            await send(response);
        };
        this.handleNormalQuery = async (mixedCaseName, send, response) => {
            const name = mixedCaseName.toLowerCase();
            logger.info('handleNormalQuery() ' + name);
            const parts = name.split('.');
            if (parts.length < 3) {
                // @ts-ignore private field
                response.header.rcode = 3;
                return send(response);
            }
            const subdomain = parts[0];
            let retIp = '';
            if (this.ownHostName === subdomain) {
                retIp = this.ownIpAddress;
            }
            else {
                let subdomainRecord;
                try {
                    subdomainRecord = await this.db.getSubdomain(subdomain);
                }
                catch (e) {
                    logger.error('handleNormalQuery exception');
                }
                if (!subdomainRecord) {
                    logger.info('handleNormalQuery() not found: ' + name);
                    // @ts-ignore private field
                    response.header.rcode = 3;
                    return send(response);
                }
                retIp = subdomainRecord.ip;
            }
            response.answers.push({
                name: mixedCaseName,
                type: dns2_1.Packet.TYPE.A,
                class: dns2_1.Packet.CLASS.IN,
                ttl: 300,
                address: retIp
            });
            await send(response);
        };
        this.handleQuery = async (request, send, _rinfo) => {
            const response = dns2_1.Packet.createResponseFromRequest(request);
            // @ts-ignore private field
            response.header.aa = 1;
            const question = request.questions[0];
            const mixedCaseName = question.name;
            const name = mixedCaseName.toLowerCase();
            if (!name.endsWith(this.domainName)) {
                logger.warn('invalid domain name in query: ' + name);
                // @ts-ignore private field
                response.header.rcode = 3;
                return send(response);
            }
            const parts = mixedCaseName.split('.');
            const mixedCaseDomainName = parts[parts.length - 2] + '.' + parts[parts.length - 1];
            // @ts-ignore private field
            logger.info(mixedCaseDomainName + ' question type 0x' + Number(question.type).toString(16));
            // @ts-ignore private field
            if (question.type == dns2_1.Packet.TYPE.SOA) {
                return this.handleSOAQuery(mixedCaseDomainName, send, response);
                // @ts-ignore private field
            }
            else if (question.type == dns2_1.Packet.TYPE.NS) {
                return this.handleNSQuery(mixedCaseDomainName, send, response);
                // @ts-ignore private field
            }
            else if (question.type == dns2_1.Packet.TYPE.TXT) {
                return this.handleTextQuery(mixedCaseName, send, response);
                // @ts-ignore private field
            }
            else if (question.type == dns2_1.Packet.TYPE.AAAA) {
                return this.handleAAAAQuery(mixedCaseName, send, response);
                // @ts-ignore private field
            }
            else if (question.type == dns2_1.Packet.TYPE.CNAME) {
                return this.handleCNAMEQuery(mixedCaseName, send, response);
                // @ts-ignore private field
            }
            else if (question.type == dns2_1.Packet.TYPE.CAA) {
                return this.handleCAAQuery(mixedCaseName, send, response);
            }
            else {
                return this.handleNormalQuery(mixedCaseName, send, response);
            }
        };
    }
    async createSubdomain(subdomain, ipAddress, port, token) {
        await this.db.createSubdomain(subdomain, ipAddress, port, token);
    }
    async updateSubdomainIpAndPort(subdomain, ipAddress, port, token) {
        await this.db.updateSubdomainIpAndPort(subdomain, ipAddress, port, token);
    }
    async updateSubdomainAcmeChallenge(fqdn, acmeChallenge) {
        const parts = fqdn.split('.');
        await this.db.updateSubdomainAcmeChallenge(parts[0], acmeChallenge);
    }
    async start() {
        this.server = (0, dns2_1.createServer)({
            udp: true,
            handle: this.handleQuery
        });
        return this.server.listen({ udp: { host: this.ownIpAddress, port: parseInt(this.dnsServerPort) } });
    }
    async stop() {
        if (this.server) {
            await this.server.close();
        }
    }
}
exports.DnsServer = DnsServer;
//# sourceMappingURL=DnsServer.js.map