import { TextDecoder, TextEncoder } from "util"
import { UUID } from "./UUID"

const enc = new TextEncoder() 
const dec = new TextDecoder()

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
            this.data = new Uint8Array(value.slice(0))
        }
        else if (stringValue) {
            //this.data.set(Uint8Array.from(Buffer.from(stringValue)))
            this.data.set(enc.encode(stringValue))
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

    equals(other: PeerID): boolean {
        return (Buffer.compare(this.data, other.value) == 0) 
    }

    toString(): string {
        /*
        const arr = []
        for (let i=0; i<this.data.length && this.data[i]!=0; i++) {
            arr.push(this.data[i])
        }
        */
        return dec.decode(this.data)
        //return Buffer.from(this.data).toString().trim()
    }

    get value(): Uint8Array {
        return this.data
    }
}