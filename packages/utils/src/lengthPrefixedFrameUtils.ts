import { Transform, TransformCallback } from 'stream'

/**
 * Utilities to deal with length-prefixed frames, i.e. | length [4 bytes] | payload [variable bytes] |
 */

export const toLengthPrefixedFrame = (payload: Uint8Array): Buffer => {
    const length = Buffer.alloc(4)
    length.writeUint32BE(payload.length)
    return Buffer.concat([length, payload])
}

export class LengthPrefixedFrameDecoder extends Transform {
    private buffer = Buffer.alloc(0)

    constructor() {
        super({ objectMode: true })
    }

    override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
        this.buffer = Buffer.concat([this.buffer, chunk])
        this.processStreamData(callback)
    }

    override _flush(callback: TransformCallback): void {
        // Handle any remaining data when the stream ends
        this.processStreamData(callback)
    }

    private processStreamData(callback: TransformCallback): void {
        while (this.buffer.length >= 4) {
            const payloadSize = this.buffer.readUInt32BE(0)

            if (this.buffer.length >= payloadSize + 4) {
                const payload = this.buffer.subarray(4, payloadSize + 4)
                this.push(payload)
                this.buffer = this.buffer.subarray(payloadSize + 4)
            } else {
                break
            }
        }
        callback()
    }
}
