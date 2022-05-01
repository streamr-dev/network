import { UUID } from "./UUID"

export class PeerID {

    private data: Uint8Array = new Uint8Array(20)

    protected constructor({ ip, value, stringValue }: { ip?: string; value?: Uint8Array; stringValue?: string } = {}) {
        if (ip) {
            const ipNum = this.ip2Int(ip)
            const view = new DataView(this.data.buffer)
            view.setInt32(0, ipNum)

            this.data.set((new UUID()).value, 4)
        }
        else if (value) {
            this.data = value
        }
        else if (stringValue) {
            this.data.set(Uint8Array.from(Buffer.from(stringValue)))
        }
    }

    static fromIp(ip: string): PeerID {
        return new PeerID({ ip })
    }

    static fromValue(val: Uint8Array): PeerID {
        return new PeerID({ value: val })
    }

    static fromString(s: string): PeerID {
        return new PeerID({ stringValue: s })
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
        return Buffer.from(this.data).toString()
    }

    get value(): Uint8Array {
        return this.data
    }
}