"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.iceServerAsString = void 0;
function iceServerAsString({ url, port, username, password, tcp }) {
    const [protocol, hostname] = url.split(':');
    if (hostname === undefined) {
        throw new Error(`invalid stun/turn format: ${url}`);
    }
    if (username === undefined && password === undefined) {
        return `${protocol}:${hostname}:${port}`;
    }
    if (username !== undefined && password !== undefined) {
        return `${protocol}:${username}:${password}@${hostname}:${port}${tcp ? '?transport=tcp' : ''}`;
    }
    throw new Error(`username (${username}) and password (${password}) must be supplied together`);
}
exports.iceServerAsString = iceServerAsString;
//# sourceMappingURL=iceServerAsString.js.map