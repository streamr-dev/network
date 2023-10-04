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
exports.AutoCertifierClient = exports.AUTOCERTIFIER_SERVICE_ID = void 0;
const eventemitter3_1 = require("eventemitter3");
const utils_1 = require("@streamr/utils");
const RestClient_1 = require("./RestClient");
const fs_1 = __importDefault(require("fs"));
const forge = __importStar(require("node-forge"));
const utils_2 = require("@streamr/utils");
const logger = new utils_2.Logger(module);
exports.AUTOCERTIFIER_SERVICE_ID = 'AutoCertifier';
class AutoCertifierClient extends eventemitter3_1.EventEmitter {
    constructor(subdomainPath, streamrWebSocketPort, restApiUrl, restApiCaCert, registerRpcMethod) {
        super();
        this.ONE_DAY = 1000 * 60 * 60 * 24;
        this.MAX_INT_32 = 2147483647;
        this.ongoingSessions = new Set();
        this.createCertificate = async () => {
            console.log("CREATE CERTIFICATE 0");
            const sessionId = await this.restClient.createSession();
            let certifiedSubdomain;
            console.log("CREATE CERTIFICATE 1");
            this.ongoingSessions.add(sessionId);
            try {
                console.log("CREATE CERTIFICATE 2");
                certifiedSubdomain = await this.restClient.createNewSubdomainAndCertificate(this.streamrWebSocketPort, sessionId);
                console.log("CREATE CERTIFICATE 3");
            }
            finally {
                this.ongoingSessions.delete(sessionId);
            }
            console.log(this);
            fs_1.default.writeFileSync(this.subdomainPath, JSON.stringify(certifiedSubdomain));
            const certObj = forge.pki.certificateFromPem(certifiedSubdomain.certificate.cert);
            const expiryTime = certObj.validity.notAfter.getTime();
            this.scheduleCertificateUpdate(expiryTime);
            this.emit('updatedSubdomain', certifiedSubdomain);
        };
        this.updateCertificate = async () => {
            const sessionId = await this.restClient.createSession();
            this.ongoingSessions.add(sessionId);
            const oldSubdomain = JSON.parse(fs_1.default.readFileSync(this.subdomainPath, 'utf8'));
            const certifiedSubdomain = await this.restClient.updateCertificate(oldSubdomain.subdomain, this.streamrWebSocketPort, oldSubdomain.token, sessionId);
            this.ongoingSessions.delete(sessionId);
            fs_1.default.writeFileSync(this.subdomainPath, JSON.stringify(certifiedSubdomain));
            const certObj = forge.pki.certificateFromPem(certifiedSubdomain.certificate.cert);
            const expiryTime = certObj.validity.notAfter.getTime();
            this.scheduleCertificateUpdate(expiryTime);
            this.emit('updatedSubdomain', certifiedSubdomain);
        };
        // This method should be called by Streamr DHT whenever the IP address or port of the node changes
        this.updateSubdomainIpAndPort = async () => {
            if (!fs_1.default.existsSync(this.subdomainPath)) {
                logger.warn('updateSubdomainIpAndPort() called while subdomain file does not exist');
                return;
            }
            const oldSubdomain = JSON.parse(fs_1.default.readFileSync(this.subdomainPath, 'utf8'));
            const sessionId = await this.restClient.createSession();
            this.ongoingSessions.add(sessionId);
            await this.restClient.updateSubdomainIpAndPort(oldSubdomain.subdomain, this.streamrWebSocketPort, sessionId, oldSubdomain.token);
            this.ongoingSessions.delete(sessionId);
        };
        this.restClient = new RestClient_1.RestClient(restApiUrl, restApiCaCert);
        this.subdomainPath = (0, utils_1.filePathToNodeFormat)(subdomainPath);
        this.streamrWebSocketPort = streamrWebSocketPort;
        registerRpcMethod(exports.AUTOCERTIFIER_SERVICE_ID, 'getSessionId', this.getSessionId.bind(this));
    }
    async start() {
        console.log("START HERE1");
        if (!fs_1.default.existsSync(this.subdomainPath)) {
            console.log("START HERE2");
            await this.createCertificate();
        }
        else {
            this.checkSubdomainValidity();
        }
    }
    async checkSubdomainValidity() {
        const sub = this.loadSubdomainFromDisk();
        if (Date.now() >= sub.expiryTime - this.ONE_DAY) {
            await this.updateCertificate();
        }
        else {
            await this.updateSubdomainIpAndPort();
            this.scheduleCertificateUpdate(sub.expiryTime);
            this.emit('updatedSubdomain', sub.subdomain);
        }
    }
    loadSubdomainFromDisk() {
        const subdomain = JSON.parse(fs_1.default.readFileSync(this.subdomainPath, 'utf8'));
        const certObj = forge.pki.certificateFromPem(subdomain.certificate.cert);
        const expiryTime = certObj.validity.notAfter.getTime();
        return { subdomain, expiryTime };
    }
    async stop() {
        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
            this.updateTimeout = undefined;
        }
    }
    scheduleCertificateUpdate(expiryTime) {
        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
            this.updateTimeout = undefined;
        }
        // update certificate 1 day before it expires
        let updateIn = expiryTime - Date.now();
        if (updateIn > this.ONE_DAY) {
            updateIn = updateIn - this.ONE_DAY;
        }
        if (updateIn > this.MAX_INT_32) {
            updateIn = this.MAX_INT_32;
        }
        logger.info('' + updateIn + ' milliseconds until certificate update');
        this.updateTimeout = setTimeout(this.checkSubdomainValidity, updateIn);
    }
    // IAutoCertifierService implementation
    async getSessionId(request, _context) {
        logger.info('getSessionId() called ' + this.ongoingSessions.size + ' ongoing sessions');
        if (this.ongoingSessions.has(request.sessionId)) {
            return { sessionId: request.sessionId };
        }
        else {
            return { error: 'client has no such ongoing session' };
        }
    }
}
exports.AutoCertifierClient = AutoCertifierClient;
//# sourceMappingURL=AutoCertifierClient.js.map