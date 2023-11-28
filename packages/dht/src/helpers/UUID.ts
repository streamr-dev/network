import { v4, parse, stringify } from 'uuid'
import { binaryToHex } from '@streamr/utils'

export class UUID {
    private buf: Uint8Array

    constructor(other?: (UUID | Uint8Array | string)) {
        if (other === undefined) {
            this.buf = new Uint8Array(16)
            v4(null, this.buf)
        } else if (other.constructor === UUID) {
            this.buf = other.buf
        } else if (typeof other === 'string') {
            this.buf = new Uint8Array(parse(other))
        } else {
            this.buf = other as Uint8Array
        }
    }

    toString(): string {
        return stringify(this.buf)
    }

    toHex(): string {
        return binaryToHex(this.buf)
    }

    equals(other: UUID): boolean {
        return (Buffer.compare(this.buf, other.value) === 0)
    }

    get value(): Uint8Array {
        return this.buf
    }
}