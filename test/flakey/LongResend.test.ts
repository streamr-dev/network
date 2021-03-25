import { wait } from 'streamr-test-utils'
import { StreamrClient, Stream } from '../../src'
import { fakePrivateKey } from '../utils'
import Connection from '../../src/Connection'
import prettyBytes from 'pretty-bytes'

const TRAM_DEMO_STREAM = '7wa7APtlTq6EC5iTCBy6dw'
/* eslint-disable require-atomic-updates, no-loop-func */

function logMemory() {
    const res = process.memoryUsage()
    return {
        rss: prettyBytes(res.rss),
        heapTotal: prettyBytes(res.heapTotal),
        heapUsed: prettyBytes(res.heapUsed),
        external: prettyBytes(res.external),
        arrayBuffers: res.arrayBuffers
    }
}

describe('LongResend', () => {
    let client: StreamrClient
    let stream: Stream
    let expectErrors = 0 // check no errors by default
    let onError = jest.fn()

    const createClient = (opts = {}) => new StreamrClient({
        autoConnect: false,
        autoDisconnect: false,
        ...opts,
    })

    beforeEach(async () => {
        client = createClient({
            auth: {
                privateKey: fakePrivateKey(),
            }
        })
        await client.connect()
        expectErrors = 0
        onError = jest.fn()
        client.onError = jest.fn()
        client.on('error', onError)
        stream = await client.getStream(TRAM_DEMO_STREAM)
    })

    afterEach(async () => {
        await wait(0)
        // ensure no unexpected errors
        expect(onError).toHaveBeenCalledTimes(expectErrors)
        if (client) {
            expect(client.onError).toHaveBeenCalledTimes(expectErrors)
        }
    })

    afterEach(async () => {
        await wait(500)
        if (client) {
            client.debug('disconnecting after test')
            await client.disconnect()
        }

        const openSockets = Connection.getOpen()
        if (openSockets !== 0) {
            await Connection.closeOpen()
            throw new Error(`sockets not closed: ${openSockets}`)
        }
    })

    const RESEND_SIZES = [
        1,
        10,
        20,
        100,
        1000,
        10000,
        25000,
    ]

    const MAX_RESEND_SIZE = 10000

    RESEND_SIZES.forEach((size) => {
        test(`can get a resend of size ${size}`, async () => {
            const id = `TEST ${size}`
            let count = 0
            const sub = await client.resend({
                stream: stream.id,
                resend: {
                    from: 0
                },
            }, () => {
                count += 1
            })
            await sub.onDone()
            client.debug(id, { count })
            if (size < MAX_RESEND_SIZE) {
                expect(count).toBe(size)
            } else {
                expect(count).toBe(10000)
            }
        }, Math.max(10000, size))
    })

    test('can get big resend', async () => {
        let count = 0
        const today = 1616527054932
        const yesterday = 1616440654932
        const sub = await client.resend({
            stream: stream.id,
            resend: {
                from: {
                    timestamp: yesterday,
                },
                to: {
                    timestamp: today,
                }
            },
        }, (msg) => {
            if (count % 1000 === 0) {
                console.log({
                    msg,
                    count,
                    memory: logMemory()
                })
            }
            count += 1
        })
        await sub.onDone()
        console.log('done', {
            count,
            memory: logMemory()
        })
    }, 1000000)
})
