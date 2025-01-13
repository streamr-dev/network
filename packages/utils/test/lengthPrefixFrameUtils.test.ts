import { binaryToHex } from '../src/binaryUtils'
import { LengthPrefixedFrameDecoder, toLengthPrefixedFrame } from '../src/lengthPrefixedFrameUtils'

describe('LengthPrefixedFrameUtils', () => {
    describe('toLengthPrefixedFrame', () => {
        it('prefixes length to payload', () => {
            const payload = Buffer.from('Hello, world!')
            const frame = toLengthPrefixedFrame(payload)
            expect(frame.readUInt32BE(0)).toBe(payload.length)
            expect(frame.subarray(4)).toEqual(payload)
        })

        it('empty payload', () => {
            const payload = new Uint8Array(0)
            const frame = toLengthPrefixedFrame(payload)
            expect(frame.readUInt32BE(0)).toBe(payload.length)
            expect(frame.length).toEqual(4)
        })
    })

    describe('LengthPrefixedFrameDecoder', () => {
        let decoder: LengthPrefixedFrameDecoder

        beforeEach(() => {
            decoder = new LengthPrefixedFrameDecoder()
        })

        it('can decode a single frame', (done) => {
            const payload = Buffer.from('Hello, world!')
            const frame = toLengthPrefixedFrame(payload)

            decoder.on('data', (data: Buffer) => {
                expect(data).toEqual(payload)
                done()
            })

            decoder.write(frame)
        })

        it('can decode multiple frames in one chunk', (done) => {
            const payload1 = Buffer.from('Hello, world!')
            const payload2 = Buffer.from('Goodbye, world!')
            const chunk = Buffer.concat([toLengthPrefixedFrame(payload1), toLengthPrefixedFrame(payload2)])

            let count = 0
            decoder.on('data', (data: Buffer) => {
                if (count === 0) {
                    expect(data).toEqual(payload1)
                } else if (count === 1) {
                    expect(data).toEqual(payload2)
                    done()
                }
                count++
            })

            decoder.write(chunk)
        })

        it('can decode a frame split across multiple chunks', (done) => {
            const payload = Buffer.from('Hello, world!')
            const frame = toLengthPrefixedFrame(payload)

            decoder.on('data', (data: Buffer) => {
                expect(data).toEqual(payload)
                done()
            })

            decoder.write(frame.subarray(0, 2))
            decoder.write(frame.subarray(2, 9))
            decoder.end(frame.subarray(9))
        })

        it('can decode multiple frames split across multiple chunks', (done) => {
            const payload1 = Buffer.from('Hello, world!')
            const payload2 = Buffer.from('Goodbye, world!')
            const frame1 = toLengthPrefixedFrame(payload1)
            const frame2 = toLengthPrefixedFrame(payload2)

            let count = 0
            decoder.on('data', (data: Buffer) => {
                if (count === 0) {
                    expect(data).toEqual(payload1)
                } else if (count === 1) {
                    expect(data).toEqual(payload2)
                    done()
                }
                count++
            })

            decoder.write(frame1.subarray(0, 2))
            decoder.write(frame1.subarray(2, 9))
            decoder.write(Buffer.concat([frame1.subarray(9), frame2.subarray(0, 6)]))
            decoder.write(frame2.subarray(6, 10))
            decoder.end(frame2.subarray(10))
        })

        it('can ignore an incomplete frame when stream ends', (done) => {
            const payload = Buffer.from('Hello, world!')
            const frame = toLengthPrefixedFrame(payload)

            decoder.on('data', (data: Buffer) => {
                fail(`Should not have received data: ${binaryToHex(data)}`)
            })
            decoder.on('end', () => {
                done()
            })

            decoder.write(frame.subarray(0, 5))
            setTimeout(() => {
                decoder.end(frame.subarray(5, 7))
            }, 10)
        })

        it('can decode a zero-sized frame', (done) => {
            const frame = toLengthPrefixedFrame(Buffer.alloc(0))

            decoder.on('data', (data: Buffer) => {
                expect(data.length).toBe(0)
                done()
            })

            decoder.write(frame)
        })
    })
})
