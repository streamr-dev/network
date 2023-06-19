import 'reflect-metadata'

import { MessageID, StreamMessage, StreamPartIDUtils, toStreamID } from '@streamr/protocol'
import { randomEthereumAddress } from '@streamr/test-utils'
import { collect } from '@streamr/utils'
import range from 'lodash/range'
import { Resends } from '../../src/subscribe/Resends'
import { mockLoggerFactory, startTestServer } from '../test-utils/utils'

const createResends = (serverUrl: string) => {
    return new Resends(
        {
            getStorageNodes: async () => [randomEthereumAddress()]
        } as any,
        {
            getStorageNodeMetadata: async () => ({ http: serverUrl })
        } as any,
        undefined as any,
        undefined as any,
        mockLoggerFactory()
    )
}

describe('Resends', () => {

    it('error handling', async () => {
        const server = await startTestServer('/streams/:streamId/data/partitions/:partition/:resendType', async (_req, res) => {
            res.status(400).json({
                error: 'Mock error'
            })
        })
        const resends = createResends(server.url)
        const requestUrl = `${server.url}/streams/stream/data/partitions/0/last?count=1&format=raw`
        await expect(async () => {
            const messages = await resends.resend(StreamPartIDUtils.parse('stream#0'), { last: 1, raw: true })
            await collect(messages)
        }).rejects.toThrowStreamrError({
            message: `Storage node fetch failed: Mock error, httpStatus=400, url=${requestUrl}`,
            code: 'STORAGE_NODE_ERROR'
        })
        await server.stop()
    })

    it('large response', async () => {
        // larger than PuhsBuffer DEFAULT_BUFFER_SIZE
        const MESSAGE_COUNT = 257
        const streamPartId = StreamPartIDUtils.parse('stream#0')
        const server = await startTestServer('/streams/:streamId/data/partitions/:partition/:resendType', async (_req, res) => {
            const publisherId = randomEthereumAddress()
            for (const _ of range(MESSAGE_COUNT)) {
                const msg = new StreamMessage({
                    messageId: new MessageID(toStreamID('streamId'), 0, 0, 0, publisherId, ''),
                    content: {},
                    signature: 'signature'
                })
                res.write(`${msg.serialize()}\n`)
            }
            res.end()
        })
        const resends = createResends(server.url)
        const response = await resends.resend(streamPartId, { last: MESSAGE_COUNT, raw: true })
        const messages = await collect(response)
        expect(messages.length).toBe(MESSAGE_COUNT)
        await server.stop()
    })
})
