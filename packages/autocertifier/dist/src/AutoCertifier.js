"use strict";
/* eslint-disable class-methods-use-this */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutoCertifier = void 0;
const Database_1 = require("./Database");
const DnsServer_1 = require("./DnsServer");
const RestServer_1 = require("./RestServer");
const uuid_1 = require("uuid");
const utils_1 = require("@streamr/utils");
const CertificateCreator_1 = require("./CertificateCreator");
const logger = new utils_1.Logger(module);
class AutoCertifier {
    // RestInterface implementation
    async createNewSubdomainAndCertificate(ipAddress, port, _streamrWebSocketPort) {
        logger.info('creating new subdomain and certificate for ' + ipAddress + ':' + port);
        const subdomain = (0, uuid_1.v4)();
        const token = (0, uuid_1.v4)();
        await this.dnsServer.createSubdomain(subdomain, ipAddress, port, token);
        const cert = await this.certificateCreator.createCertificate(subdomain + '.' + this.domainName);
        const ret = {
            subdomain: subdomain,
            token: token,
            certificate: cert
        };
        return ret;
    }
    async createNewCertificateForSubdomain(subdomain, ipAddress, port, streamrWebSocketPort, token) {
        logger.info('creating new certificate for ' + subdomain + ' and ' + ipAddress + ':' + port);
        // This will throw if the token is incorrect
        await this.updateSubdomainIpAndPort(subdomain, ipAddress, port, streamrWebSocketPort, token);
        const cert = await this.certificateCreator.createCertificate(subdomain + '.' + this.domainName);
        const ret = {
            subdomain: subdomain,
            token: token,
            certificate: cert
        };
        return ret;
    }
    async updateSubdomainIpAndPort(subdomain, ipAddress, port, _streamrWebSocketPort, token) {
        logger.info('updating subdomain ip and port for ' + subdomain + ' to ' + ipAddress + ':' + port);
        await this.dnsServer.updateSubdomainIpAndPort(subdomain, ipAddress, port, token);
    }
    // ChallengeInterface implementation
    async createChallenge(name, value) {
        logger.info('creating challenge for ' + name + ' with value ' + value);
        this.dnsServer.updateSubdomainAcmeChallenge(name, value);
    }
    async deleteChallenge(_name) {
    }
    async start() {
        this.domainName = process.env['AUTOICERTIFIER_DOMAIN_NAME'];
        if (!this.domainName) {
            throw new Error('AUTOICERTIFIER_DOMAIN_NAME environment variable is not set');
        }
        // the dns server will answer to NS queries with 
        // AUTOICERTIFIER_OWN_HOSTNAME.AUTOICERTIFIER_DOMAIN_NAME 
        const ownHostName = process.env['AUTOICERTIFIER_OWN_HOSTNAME'];
        if (!ownHostName) {
            throw new Error('AUTOICERTIFIER_OWN_HOSTNAME environment variable is not set');
        }
        const ownIpAddress = process.env['AUTOICERTIFIER_OWN_IP_ADDRESS'];
        if (!ownIpAddress) {
            throw new Error('AUTOICERTIFIER_OWN_IP_ADDRESS environment variable is not set');
        }
        const dnsServerPort = process.env['AUTOICERTIFIER_DNS_SERVER_PORT'];
        if (!dnsServerPort) {
            throw new Error('AUTOICERTIFIER_DNS_SERVER_PORT environment variable is not set');
        }
        const restServerPort = process.env['AUTOICERTIFIER_REST_SERVER_PORT'];
        if (!restServerPort) {
            throw new Error('AUTOICERTIFIER_REST_SERVER_PORT environment variable is not set');
        }
        const databaseFilePath = process.env['AUTOICERTIFIER_DATABASE_FILE_PATH'];
        if (!databaseFilePath) {
            throw new Error('AUTOICERTIFIER_DATABASE_FILE_PATH environment variable is not set');
        }
        const accountPrivateKeyPath = process.env['AUTOICERTIFIER_ACCOUNT_PRIVATE_KEY_PATH'];
        if (!accountPrivateKeyPath) {
            throw new Error('AUTOICERTIFIER_ACCOUNT_PRIVATE_KEY_PATH environment variable is not set');
        }
        const acmeDirectoryUrl = process.env['AUTOCERTIFIER_ACME_DIRECTORY_URL'];
        if (!acmeDirectoryUrl) {
            throw new Error('AUTOCERTIFIER_ACME_DIRECTORY_URL environment variable is not set');
        }
        const hmacKid = process.env['AUTOICERTIFIER_HMAC_KID'];
        if (!hmacKid) {
            throw new Error('AUTOICERTIFIER_HMAC_KID environment variable is not set');
        }
        const hmacKey = process.env['AUTOICERTIFIER_HMAC_KEY'];
        if (!hmacKey) {
            throw new Error('AUTOICERTIFIER_HMAC_KEY environment variable is not set');
        }
        this.database = new Database_1.Database(databaseFilePath);
        await this.database.start();
        logger.info('database is running on file ' + databaseFilePath);
        this.dnsServer = new DnsServer_1.DnsServer(this.domainName, ownHostName, dnsServerPort, ownIpAddress, this.database);
        await this.dnsServer.start();
        logger.info('dns server is running for domain ' + this.domainName + ' on port ' + dnsServerPort);
        this.certificateCreator = new CertificateCreator_1.CertificateCreator(acmeDirectoryUrl, hmacKid, hmacKey, accountPrivateKeyPath, this);
        await this.certificateCreator.start();
        logger.info('certificate creator is running');
        this.restServer = new RestServer_1.RestServer(restServerPort, this);
        await this.restServer.start();
        logger.info('rest server is running on port ' + restServerPort);
    }
    async stop() {
        if (this.restServer) {
            await this.restServer.stop();
        }
        if (this.dnsServer) {
            await this.dnsServer.stop();
        }
        if (this.database) {
            await this.database.stop();
        }
    }
}
exports.AutoCertifier = AutoCertifier;
//# sourceMappingURL=AutoCertifier.js.map