"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ParsedLocalCandidate = exports.CandidateType = void 0;
var CandidateType;
(function (CandidateType) {
    CandidateType["HOST"] = "host";
    CandidateType["SRFLX"] = "srflx";
    CandidateType["PRFLX"] = "prflx";
    CandidateType["RELAY"] = "relay";
})(CandidateType || (exports.CandidateType = CandidateType = {}));
class ParsedLocalCandidate {
    constructor(candidate) {
        const split = candidate.split(" ");
        this.id = split[0];
        this.component = split[1];
        this.protocol = split[2];
        this.priority = split[3];
        this.ip = split[4];
        this.port = split[5];
        this.type = split[7];
    }
    getType() {
        return this.type;
    }
    setIp(externalIp) {
        this.ip = externalIp;
    }
    toString() {
        return `${this.id} ${this.component} ${this.protocol} ${this.priority} ${this.ip} ${this.port} typ ${this.type}`;
    }
}
exports.ParsedLocalCandidate = ParsedLocalCandidate;
//# sourceMappingURL=ParsedLocalCandidate.js.map