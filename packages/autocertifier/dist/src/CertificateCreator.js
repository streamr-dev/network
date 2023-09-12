"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CertificateCreator = void 0;
/* eslint-disable @typescript-eslint/parameter-properties */
const utils_1 = require("@streamr/utils");
const acme = __importStar(require("acme-client"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const logger = new utils_1.Logger(module);
class CertificateCreator {
    constructor(acmeDirectoryUrl, hmacKid, hmacKey, privateKeyPath, challengeInterface) {
        this.acmeDirectoryUrl = acmeDirectoryUrl;
        this.hmacKid = hmacKid;
        this.hmacKey = hmacKey;
        this.challengeInterface = challengeInterface;
        if (privateKeyPath.startsWith('~/')) {
            this.accountPrivateKeyPath = privateKeyPath.replace('~', os_1.default.homedir());
        }
        else {
            this.accountPrivateKeyPath = privateKeyPath;
        }
    }
    async createCertificate(fqdn) {
        logger.info(`Creating certificate for ${fqdn}`);
        logger.info('Creating acme client');
        const client = new acme.Client({
            directoryUrl: this.acmeDirectoryUrl,
            accountKey: this.accountPrivateKey,
            externalAccountBinding: {
                kid: this.hmacKid,
                hmacKey: this.hmacKey
            }
        });
        logger.info('Creating CSR');
        const [key, csr] = await acme.crypto.createCsr({
            commonName: fqdn
        });
        logger.info('Creating certificate using client.auto');
        let cert;
        try {
            cert = await client.auto({
                csr,
                email: 'autocertifier@streamr.network',
                termsOfServiceAgreed: true,
                challengePriority: ['dns-01'],
                challengeCreateFn: async (authz, _challenge, keyAuthorization) => {
                    await this.challengeInterface.createChallenge(authz.identifier.value, keyAuthorization);
                },
                challengeRemoveFn: async (authz, _challenge, _keyAuthorization) => {
                    await this.challengeInterface.deleteChallenge(authz.identifier.value);
                },
            });
        }
        catch (e) {
            logger.error('Failed to create certificate: ' + e.message);
            throw e;
        }
        logger.info(`CSR:\n${csr.toString()}`);
        logger.info(`Private key:\n${key.toString()}`);
        logger.info(`Certificate:\n${cert.toString()}`);
        return { cert: cert.toString(), key: key.toString() };
    }
    async start() {
        // try to read private key from file
        try {
            // try to read private key from file
            this.accountPrivateKey = fs_1.default.readFileSync(this.accountPrivateKeyPath);
        }
        catch (err) {
            if (err.code === 'ENOENT') {
                // if not found, create new private key and save it to file
                this.accountPrivateKey = await acme.crypto.createPrivateKey();
                fs_1.default.mkdirSync(path_1.default.dirname(this.accountPrivateKeyPath), { recursive: true });
                fs_1.default.writeFileSync(this.accountPrivateKeyPath, this.accountPrivateKey, { mode: 0o600 });
            }
            else {
                throw err;
            }
        }
    }
}
exports.CertificateCreator = CertificateCreator;
//# sourceMappingURL=CertificateCreator.js.map