"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAddressFromIceCandidate = exports.isPrivateIPv4 = void 0;
const ipaddr_js_1 = __importDefault(require("ipaddr.js"));
// IPv4 private address ranges as specified by RFC 1918
const IPv4PrivateRanges = [
    '10.0.0.0/8',
    '172.16.0.0/12',
    '192.168.0.0/16',
].map((a) => ipaddr_js_1.default.parseCIDR(a));
function isPrivateIPv4(address) {
    if (ipaddr_js_1.default.IPv4.isValid(address)) {
        const ip = ipaddr_js_1.default.IPv4.parse(address);
        for (const range of IPv4PrivateRanges) {
            if (ip.match(range)) {
                return true;
            }
        }
    }
    return false;
}
exports.isPrivateIPv4 = isPrivateIPv4;
function getAddressFromIceCandidate(candidate) {
    const fields = candidate.split(' ').filter((field) => field.length > 0);
    return fields.length >= 5 && ipaddr_js_1.default.isValid(fields[4]) ? fields[4] : undefined;
}
exports.getAddressFromIceCandidate = getAddressFromIceCandidate;
//# sourceMappingURL=AddressTools.js.map