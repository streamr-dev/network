import { fetchPrivateKeyWithGas } from '@streamr/test-utils'
import range from 'lodash/range'
import { Message, Stream } from 'streamr-client'
import { DOCKER_DEV_STORAGE_NODE, createTestClient, runCommand } from './utils'

const parseJSONs = (lines: string[]): any[] => {
    return lines.map((line) => JSON.parse(line))
}

describe('resend stream', () => {

    let privateKey: string
    let stream: Stream
    const messages: Message[] = []

    beforeAll(async () => {
        privateKey = await fetchPrivateKeyWithGas()
        const client = createTestClient(privateKey)
        stream = await client.createStream(`/${Date.now()}`)
        await stream.addToStorageNode(DOCKER_DEV_STORAGE_NODE)
        for (const msgId of range(10)) {
            const msg = await stream.publish({ msgId })
            messages.push(msg)
        }
        // TODO some delay needed?
        await client.destroy()
    }, 40 * 1000) // TODO is this timeout enough?

    it('last', async () => {
        const outputLines = await runCommand(`stream resend last 3 ${stream.id}`, {
            privateKey
        })
        expect(parseJSONs(outputLines)).toEqual([
            { msgId: 7 },
            { msgId: 8 },
            { msgId: 9 }
        ])
    }, 20 * 1000)

    it('from', async () => {
        const minTimestamp = new Date(messages[8].timestamp).toISOString()
        const outputLines = await runCommand(`stream resend from ${minTimestamp} ${stream.id}`, {
            privateKey
        })
        expect(parseJSONs(outputLines)).toEqual([
            { msgId: 8 },
            { msgId: 9 }
        ])
    }, 20 * 1000)

    it('range', async () => {
        const minTimestamp = new Date(messages[2].timestamp).toISOString()
        const maxTimestamp = new Date(messages[4].timestamp).toISOString()
        const outputLines = await runCommand(`stream resend range ${minTimestamp} ${maxTimestamp} ${stream.id}`, {
            privateKey
        })
        expect(parseJSONs(outputLines)).toEqual([
            { msgId: 2 },
            { msgId: 3 },
            { msgId: 4 }
        ])
    }, 20 * 1000)

})
