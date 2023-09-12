"use strict";
/* eslint-disable @typescript-eslint/parameter-properties, class-methods-use-this */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RestServer = void 0;
const express_1 = __importDefault(require("express"));
const utils_1 = require("@streamr/utils");
const errors_1 = require("./errors");
const body_parser_1 = __importDefault(require("body-parser"));
const logger = new utils_1.Logger(module);
class RestServer {
    constructor(port, engine) {
        this.port = port;
        this.engine = engine;
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
            return { ip: '' + ip, port: '' + port };
        };
    }
    async start() {
        return new Promise((resolve, _reject) => {
            const sendError = (res, err) => {
                if (err instanceof errors_1.Err) {
                    logger.error('Error ' + JSON.stringify(err));
                    res.status(err.httpStatus).send(err.toApiError());
                }
                else {
                    logger.error('Unspecified error ' + JSON.stringify(err));
                    const unspecifiedError = new errors_1.UnspecifiedError('Unspecified error');
                    res.status(unspecifiedError.httpStatus).send(unspecifiedError.toApiError());
                }
            };
            const sendResponse = (res, data) => {
                if (!data) {
                    res.json({});
                }
                else {
                    res.json(data);
                }
            };
            const app = (0, express_1.default)();
            app.use(body_parser_1.default.json());
            app.get('/robots.txt', (_req, res) => {
                res.type('text/plain');
                res.send('User-agent: *\nDisallow: /');
            });
            // create new subdomain and certificate
            app.patch('/certifiedsubdomains', async (req, res) => {
                if (!req.body || !req.body.streamrWebSocketPort) {
                    const err = new errors_1.SteamrWebSocketPortMissing('Streamr websocket port not given');
                    sendError(res, err);
                    return;
                }
                const streamrWebSocketPort = req.body.streamrWebSocketPort + '';
                const ipAndPort = this.extractIpAndPort(req);
                if (!ipAndPort) {
                    const err = new errors_1.FailedToExtractIpAddress('Failed to extract IP address from request');
                    sendError(res, err);
                    return;
                }
                try {
                    const certifiedSubdomain = await this.engine.createNewSubdomainAndCertificate(ipAndPort.ip, ipAndPort.port, streamrWebSocketPort);
                    sendResponse(res, certifiedSubdomain);
                }
                catch (err) {
                    sendError(res, err);
                    return;
                }
            });
            // get new certificate for existing subdomain
            app.patch('/certifiedsubdomains/:subdomain', async (req, res) => {
                const subdomain = req.params.subdomain;
                if (!req.body || !req.body.streamrWebSocketPort) {
                    const err = new errors_1.SteamrWebSocketPortMissing('Streamr websocket port not given');
                    sendError(res, err);
                    return;
                }
                const streamrWebSocketPort = req.body.streamrWebSocketPort + '';
                if (!req.body || !req.body.token) {
                    const err = new errors_1.TokenMissing('Token not given');
                    sendError(res, err);
                    return;
                }
                const token = req.body.token;
                const ipAndPort = this.extractIpAndPort(req);
                if (!ipAndPort) {
                    const err = new errors_1.FailedToExtractIpAddress('Failed to extract IP address from request');
                    sendError(res, err);
                    return;
                }
                try {
                    const certifiedSubdomain = await this.engine.createNewCertificateForSubdomain(subdomain, ipAndPort.ip, ipAndPort.port, streamrWebSocketPort, token);
                    sendResponse(res, certifiedSubdomain);
                }
                catch (err) {
                    sendError(res, err);
                    return;
                }
            });
            // update subdomain ip and port
            app.put('/certifiedsubdomains/:subdomain/ip', async (req, res) => {
                const subdomain = req.params.subdomain;
                if (!req.body || !req.body.streamrWebSocketPort) {
                    const err = new errors_1.SteamrWebSocketPortMissing('Streamr websocket port not given');
                    sendError(res, err);
                    return;
                }
                const streamrWebSocketPort = req.body.streamrWebSocketPort + '';
                if (!req.body || !req.body.token) {
                    const err = new errors_1.TokenMissing('Token not given');
                    sendError(res, err);
                    return;
                }
                const token = req.body.token;
                const ipAndPort = this.extractIpAndPort(req);
                if (!ipAndPort) {
                    const err = new errors_1.FailedToExtractIpAddress('Failed to extract IP address from request');
                    sendError(res, err);
                    return;
                }
                try {
                    await this.engine.updateSubdomainIpAndPort(subdomain, ipAndPort.ip, ipAndPort.port, streamrWebSocketPort, token);
                    sendResponse(res);
                }
                catch (err) {
                    sendError(res, err);
                }
            });
            this.server = app.listen(this.port, () => {
                logger.info('Rest server is running on port ' + this.port);
                resolve();
            });
        });
    }
    async stop() {
        if (this.server) {
            this.server.close();
        }
    }
}
exports.RestServer = RestServer;
//# sourceMappingURL=RestServer.js.map