// eslint-disable-next-line import/no-unresolved
import { finished } from 'stream/promises'
// eslint-disable-next-line import/no-unresolved
import { WebStreamToNodeStream } from '../../src/utils/WebStreamToNodeStream'
// eslint-disable-next-line import/no-unresolved
import { Msg } from '../utils'

const version = process.version.slice(1).split('.').map((v) => Number.parseInt(v, 10))
describe('WebStreamToNodeStream', () => {
    // webstreams only in 16.5+
    if (version[0] < 16 && version[1] < 5) {
        test.skip('node version too low, requires v16.5+')
        return
    }

    it('works', async () => {
        // eslint-disable-next-line import/no-unresolved
        const WebStream: any = await import('node:stream/web')
        // eslint-disable-next-line import/no-unresolved
        const Timers = await import('node:timers/promises')
        const published: ReturnType<typeof Msg>[] = []
        const webStream = new WebStream.ReadableStream({
            async start(controller: any) {
                for await (const _ of Timers.setInterval(100)) {
                    const msg = Msg()
                    published.push(msg)
                    controller.enqueue(msg)
                    if (published.length === 5) {
                        controller.close()
                        break
                    }
                }
            }
        })

        const nodeStream = WebStreamToNodeStream(webStream, { objectMode: true })
        expect(typeof nodeStream.pipe).toBe('function')
        const received = []
        for await (const msg of nodeStream) {
            received.push(msg)
        }
        expect(received).toEqual(published)
        expect(nodeStream.readableEnded).toBeTruthy()
    })

    it('can work with small buffer', async () => {
        // eslint-disable-next-line import/no-unresolved
        const WebStream: any = await import('node:stream/web')
        // eslint-disable-next-line import/no-unresolved
        const Timers = await import('node:timers/promises')
        const published: ReturnType<typeof Msg>[] = []
        const webStream = new WebStream.ReadableStream({
            async start(controller: any) {
                for await (const _ of Timers.setInterval(100)) {
                    const msg = Msg()
                    published.push(msg)
                    controller.enqueue(msg)
                    if (published.length === 5) {
                        controller.close()
                        break
                    }
                }
            }
        })

        const nodeStream = WebStreamToNodeStream(webStream, { objectMode: true, highWaterMark: 1 })
        expect(typeof nodeStream.pipe).toBe('function')
        const received = []
        for await (const msg of nodeStream) {
            received.push(msg)
        }
        expect(received).toEqual(published)
        expect(nodeStream.readableEnded).toBeTruthy()
    })

    it('can work with errors', async () => {
        // eslint-disable-next-line import/no-unresolved
        const WebStream: any = await import('node:stream/web')
        // eslint-disable-next-line import/no-unresolved
        const Timers = await import('node:timers/promises')
        const published: ReturnType<typeof Msg>[] = []
        const webStream = new WebStream.ReadableStream({
            async start(controller: any) {
                for await (const _ of Timers.setInterval(100)) {
                    const msg = Msg()
                    published.push(msg)
                    controller.enqueue(msg)
                    if (published.length === 5) {
                        controller.close()
                        break
                    }
                }
            }
        })

        const received: any[] = []
        const nodeStream = WebStreamToNodeStream(webStream, {
            objectMode: true,
            highWaterMark: 1,
            transform(chunk, _enc, done) {
                if (received.length === 3) {
                    done(err)
                    return
                }
                this.push(chunk)
                done()
            }
        })
        expect(typeof nodeStream.pipe).toBe('function')
        const err = new Error('expected')
        await expect(async () => {
            for await (const msg of nodeStream) {
                received.push(msg)
            }
        }).rejects.toThrow(err)
        await finished(nodeStream)
        expect(received).toEqual(published.slice(0, 3))
        expect(nodeStream.readable).not.toBeTruthy()
        expect(nodeStream.destroyed).toBeTruthy()
    })
})
