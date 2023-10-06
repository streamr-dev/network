"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RestClient = void 0;
const request_1 = __importDefault(require("request"));
const errors_1 = require("./errors");
const utils_1 = require("@streamr/utils");
const logger = new utils_1.Logger(module);
class RestClient {
    // the caCert MUST be hard-coded into the Streamr node config
    constructor(baseUrl, caCert) {
        this.baseUrl = baseUrl;
        this.caCert = caCert;
    }
    async createSession() {
        const url = this.baseUrl + '/sessions';
        const response = await this.post(url, {});
        return response.sessionId;
    }
    async createNewSubdomainAndCertificate(streamrWebSocketPort, sessionId) {
        const url = this.baseUrl + '/certifiedSubdomains';
        const body = {
            streamrWebSocketPort: streamrWebSocketPort,
            sessionId: sessionId
        };
        const response = await this.patch(url, body);
        return response;
    }
    async updateCertificate(subdomain, streamrWebSocketPort, sessioId, token) {
        const url = this.baseUrl + '/certifiedsubdomains/' + encodeURIComponent(subdomain);
        const body = {
            token: token,
            sessionId: sessioId,
            streamrWebSocketPort: streamrWebSocketPort
        };
        const response = await this.patch(url, body);
        return response;
    }
    async updateSubdomainIpAndPort(subdomain, streamrWebSocketPort, sessioId, token) {
        logger.info('updateSubdomainIpAndPort() subdomain: ' + subdomain + ', streamrWebSocketPort:  ' + streamrWebSocketPort);
        logger.info('sessioId: ' + sessioId + ', token: ' + token);
        const url = this.baseUrl + '/certifiedsubdomains/' + encodeURIComponent(subdomain) + '/ip';
        const body = {
            token: token,
            sessionId: sessioId,
            streamrWebSocketPort: streamrWebSocketPort
        };
        await this.put(url, body);
    }
    post(url, body) {
        return new Promise((resolve, reject) => {
            request_1.default.post(url, { json: body, ca: this.caCert }, (error, response, body) => {
                if (error) {
                    reject(error);
                }
                else if (response.statusCode >= 200 && response.statusCode < 300) {
                    resolve(body);
                }
                else {
                    reject(new errors_1.ServerError(body));
                }
            });
        });
    }
    put(url, body) {
        return new Promise((resolve, reject) => {
            request_1.default.put(url, { json: body, ca: this.caCert }, (error, response, body) => {
                if (error) {
                    reject(error);
                }
                else if (response.statusCode >= 200 && response.statusCode < 300) {
                    resolve(body);
                }
                else {
                    reject(new errors_1.ServerError(body));
                }
            });
        });
    }
    patch(url, body) {
        return new Promise((resolve, reject) => {
            request_1.default.patch(url, { json: body, ca: this.caCert }, (error, response, body) => {
                if (error) {
                    reject(error);
                }
                else if (response.statusCode >= 200 && response.statusCode < 300) {
                    resolve(body);
                }
                else {
                    reject(new errors_1.ServerError(body));
                }
            });
        });
    }
}
exports.RestClient = RestClient;
//# sourceMappingURL=RestClient.js.map