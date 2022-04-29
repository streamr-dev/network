import { UUID } from "./UUID"

export class PeerID {

    private ip: string | null = null
    private uuid: UUID | null = null
    private data: Uint8Array | null = null

    protected constructor({ ip, value }: { ip?: string; value?: Uint8Array } = {}) {

        if (ip) {
            this.ip = ip
            this.uuid = new UUID()
        }
        else if (value) {
            this.data = value
        }
    }

    static fromIp(ip: string): PeerID {
        return new PeerID({ ip })
    }

    static fromValue(val: Uint8Array): PeerID {
        return new PeerID({ value: val })
    }

    private ip2Int(ip: string): number {
        return ip.split('.').map((octet, index, array) => {
            return parseInt(octet) * Math.pow(256, (array.length - index - 1))
        }).reduce((prev, curr) => {
            return prev + curr
        })
    }

    private int2Ip(value: number) {
        return [
            (value >> 24) & 0xff,
            (value >> 16) & 0xff,
            (value >> 8) & 0xff,
            value & 0xff
        ].join('.')
    }

    toString(): string {
        if (this.data) {
            return JSON.stringify(this.data)
        }
        else {
            return this.ip + ':' + this.uuid?.toString()
        }
    }

    get value(): Uint8Array {
        if (this.ip && this.uuid) {

            const ret = new Uint8Array(20)
            const ipNum = this.ip2Int(this.ip)
            const view = new DataView(ret.buffer)
            view.setInt32(0, ipNum)
            ret.set(this.uuid.value, 4)

            return ret
        }
        else if (this.data) {
            return this.data
        }
        else {
            return new Uint8Array(20)
        }
    }
}