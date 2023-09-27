"use strict";
/* eslint-disable @typescript-eslint/parameter-properties, class-methods-use-this */
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
exports.RestServer = void 0;
const express_1 = __importDefault(require("express"));
const utils_1 = require("@streamr/utils");
const errors_1 = require("./errors");
const body_parser_1 = __importDefault(require("body-parser"));
const https = __importStar(require("https"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const createSelfSignedCertificate_1 = require("./utlis/createSelfSignedCertificate");
const filePathToNodeFormat_1 = require("./utlis/filePathToNodeFormat");
const logger = new utils_1.Logger(module);
class RestServer {
    constructor(ownIpAddress, port, caCertPath, caKeyPath, certPath, keyPath, engine) {
        this.createSession = async (_req, res) => {
            try {
                const session = await this.engine.createSession();
                this.sendResponse(res, session);
            }
            catch (err) {
                this.sendError(res, err);
                return;
            }
        };
        this.createSubdomainAndCertificate = async (req, res) => {
            logger.info('createSubdomainAndCertificate');
            const body = req.body;
            if (!body || !body.streamrWebSocketPort) {
                const err = new errors_1.SteamrWebSocketPortMissing('Streamr websocket port not given');
                this.sendError(res, err);
                return;
            }
            const streamrWebSocketPort = body.streamrWebSocketPort + '';
            const streamrWebSocketCaCert = body.streamrWebSocketCaCert;
            const ipAndPort = this.extractIpAndPort(req);
            if (!ipAndPort) {
                const err = new errors_1.FailedToExtractIpAddress('Failed to extract IP address from request');
                this.sendError(res, err);
                return;
            }
            const sessionId = body.sessionId;
            try {
                const certifiedSubdomain = await this.engine.createNewSubdomainAndCertificate(ipAndPort.ip, ipAndPort.port, streamrWebSocketPort, sessionId, streamrWebSocketCaCert);
                this.sendResponse(res, certifiedSubdomain);
            }
            catch (err) {
                this.sendError(res, err);
                return;
            }
        };
        this.createNewCertificateForExistingSubdomain = async (req, res) => {
            const subdomain = req.params.subdomain;
            const body = req.body;
            if (!body || !body.streamrWebSocketPort) {
                const err = new errors_1.SteamrWebSocketPortMissing('Streamr websocket port not given');
                this.sendError(res, err);
                return;
            }
            const streamrWebSocketPort = body.streamrWebSocketPort + '';
            if (!body || !body.token) {
                const err = new errors_1.TokenMissing('Token not given');
                this.sendError(res, err);
                return;
            }
            const token = body.token;
            const sessionId = body.sessionId;
            const ipAndPort = this.extractIpAndPort(req);
            if (!ipAndPort) {
                const err = new errors_1.FailedToExtractIpAddress('Failed to extract IP address from request');
                this.sendError(res, err);
                return;
            }
            try {
                const certifiedSubdomain = await this.engine.createNewCertificateForSubdomain(subdomain, ipAndPort.ip, ipAndPort.port, streamrWebSocketPort, sessionId, token);
                this.sendResponse(res, certifiedSubdomain);
            }
            catch (err) {
                this.sendError(res, err);
                return;
            }
        };
        this.updateSubdomainIpAndPort = async (req, res) => {
            const subdomain = req.params.subdomain;
            const body = req.body;
            if (!body || !body.streamrWebSocketPort) {
                const err = new errors_1.SteamrWebSocketPortMissing('Streamr websocket port not given');
                this.sendError(res, err);
                return;
            }
            const streamrWebSocketPort = req.body.streamrWebSocketPort + '';
            if (!body || !body.token) {
                const err = new errors_1.TokenMissing('Token not given');
                this.sendError(res, err);
                return;
            }
            const token = body.token;
            const sessionId = body.sessionId;
            const ipAndPort = this.extractIpAndPort(req);
            if (!ipAndPort) {
                const err = new errors_1.FailedToExtractIpAddress('Failed to extract IP address from request');
                this.sendError(res, err);
                return;
            }
            try {
                await this.engine.updateSubdomainIpAndPort(subdomain, ipAndPort.ip, ipAndPort.port, streamrWebSocketPort, sessionId, token);
                this.sendResponse(res);
            }
            catch (err) {
                this.sendError(res, err);
            }
        };
        this.extractIpAndPort = (req) => {
            // take x-forwarded for into account
            const remoteIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
            const remotePort = req.headers['x-forwarded-port'] || req.socket.remotePort;
            let ip = remoteIp;
            let port = remotePort;
            if (typeof remoteIp !== 'string' && typeof remoteIp !== 'number') {
                if (Array.isArray(remoteIp) && remoteIp.length > 0) {
                    ip = remoteIp[0];
                }
                else {
                    logger.error('invalid remote ip: ' + remoteIp);
                    return undefined;
                }
            }
            if (typeof remotePort !== 'string' && typeof remotePort !== 'number') {
                if (Array.isArray(remotePort) && remotePort.length > 0) {
                    port = remotePort[0];
                }
                else {
                    logger.error('invalid remote port: ' + remotePort);
                    return undefined;
                }
            }
            logger.info('extracted ip: ' + ip + ' port: ' + port + ' from request');
            return { ip: '' + ip, port: '' + port };
        };
        this.ownIpAddress = ownIpAddress;
        this.port = port;
        this.caCertPath = (0, filePathToNodeFormat_1.filePathToNodeFormat)(caCertPath);
        this.caKeyPath = (0, filePathToNodeFormat_1.filePathToNodeFormat)(caKeyPath);
        this.certPath = (0, filePathToNodeFormat_1.filePathToNodeFormat)(certPath);
        this.keyPath = (0, filePathToNodeFormat_1.filePathToNodeFormat)(keyPath);
        this.engine = engine;
    }
    async start() {
        return new Promise((resolve, _reject) => {
            this.createSelfSignedCertsIfTheyDontExist();
            const app = (0, express_1.default)();
            app.use(body_parser_1.default.json());
            app.get('/robots.txt', (_req, res) => {
                res.type('text/plain');
                res.send('User-agent: *\nDisallow: /');
            });
            // create new session
            app.post('/sessions', this.createSession);
            // create new subdomain and certificate
            app.patch('/certifiedsubdomains', async (req, res) => { await this.createSubdomainAndCertificate(req, res); });
            // get new certificate for existing subdomain
            app.patch('/certifiedsubdomains/:subdomain', this.createNewCertificateForExistingSubdomain);
            // update subdomain ip and port
            app.put('/certifiedsubdomains/:subdomain/ip', this.updateSubdomainIpAndPort);
            const options = {
                key: fs.readFileSync(this.keyPath),
                cert: fs.readFileSync(this.certPath)
            };
            this.server = https.createServer(options, app);
            this.server.listen(parseInt(this.port), this.ownIpAddress, () => {
                logger.info('Rest server is running on port ' + this.port);
                resolve();
            });
        });
    }
    createSelfSignedCertsIfTheyDontExist() {
        if (!fs.existsSync(this.caCertPath) || !fs.existsSync(this.caKeyPath) ||
            !fs.existsSync(this.certPath) || !fs.existsSync(this.keyPath)) {
            const certs = (0, createSelfSignedCertificate_1.createSelfSignedCertificate)(1200);
            if (!fs.existsSync(path.dirname(this.caCertPath))) {
                fs.mkdirSync(path.dirname(this.caCertPath), { recursive: true });
            }
            if (!fs.existsSync(path.dirname(this.caKeyPath))) {
                fs.mkdirSync(path.dirname(this.caKeyPath), { recursive: true });
            }
            if (!fs.existsSync(path.dirname(this.certPath))) {
                fs.mkdirSync(path.dirname(this.certPath), { recursive: true });
            }
            if (!fs.existsSync(path.dirname(this.keyPath))) {
                fs.mkdirSync(path.dirname(this.keyPath), { recursive: true });
            }
            fs.writeFileSync(this.caCertPath, certs.caCert, { flag: 'w' });
            fs.writeFileSync(this.caKeyPath, certs.caKey, { flag: 'w' });
            fs.writeFileSync(this.certPath, certs.serverCert, { flag: 'w' });
            fs.writeFileSync(this.keyPath, certs.serverKey, { flag: 'w' });
        }
    }
    sendError(res, err) {
        if (err instanceof errors_1.Err) {
            logger.error('Error ' + JSON.stringify(err));
            res.status(err.httpStatus).send(err.toApiError());
        }
        else {
            logger.error('Unspecified error ' + JSON.stringify(err));
            const unspecifiedError = new errors_1.UnspecifiedError('Unspecified error');
            res.status(unspecifiedError.httpStatus).send(unspecifiedError.toApiError());
        }
    }
    sendResponse(res, data) {
        if (!data) {
            res.json({});
        }
        else {
            res.json(data);
        }
    }
    async stop() {
        if (this.server) {
            this.server.close();
        }
    }
}
exports.RestServer = RestServer;
//# sourceMappingURL=RestServer.js.map