export declare enum CandidateType {
    HOST = "host",
    SRFLX = "srflx",
    PRFLX = "prflx",
    RELAY = "relay"
}
export declare class ParsedLocalCandidate {
    private readonly id;
    private readonly component;
    private readonly protocol;
    private readonly priority;
    private ip;
    private readonly port;
    private readonly type;
    constructor(candidate: string);
    getType(): CandidateType;
    setIp(externalIp: string): void;
    toString(): string;
}
