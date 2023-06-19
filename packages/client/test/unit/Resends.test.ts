import 'reflect-metadata'

import { StreamPartIDUtils } from '@streamr/protocol'
import { randomEthereumAddress, startTestServer } from '@streamr/test-utils'
import { collect } from '@streamr/utils'
import { Resends } from '../../src/subscribe/Resends'
import { mockLoggerFactory } from '../test-utils/utils'

describe('Resends', () => {

    it('error handling', async () => {
        const server = await startTestServer('/streams/:streamId/data/partitions/:partition/:resendType', async (_req, res) => {
            res.status(400).json({
                error: 'Mock error'
            })
        })
        const resends = new Resends(
            {
                getStorageNodes: async () => [randomEthereumAddress()]
            } as any,
            {
                getStorageNodeMetadata: async () => ({ http: server.url })
            } as any,
            undefined as any,
            undefined as any,
            mockLoggerFactory()
        )
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
})
