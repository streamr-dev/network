export enum CandidateType {
    HOST = 'host',
    SRFLX = 'srflx',
    PRFLX = 'prflx',
    RELAY = 'relay'
}

export class ParsedLocalCandidate {
    private readonly id: string
    private readonly component: string
    private readonly protocol: string
    private readonly priority: string
    private ip: string
    private readonly port: string
    private readonly type: CandidateType

    constructor(candidate: string) {
        const split = candidate.split(" ")
        this.id = split[0]
        this.component = split[1]
        this.protocol = split[2]
        this.priority = split[3]
        this.ip = split[4]
        this.port = split[5]
        this.type = split[7] as CandidateType
    }

    getType(): CandidateType {
        return this.type
    }
    
    setIp(externalIp: string): void {
        this.ip = externalIp
    }

    toString(): string {
        return `${this.id} ${this.component} ${this.protocol} ${this.priority} ${this.ip} ${this.port} typ ${this.type}`
    }
}
