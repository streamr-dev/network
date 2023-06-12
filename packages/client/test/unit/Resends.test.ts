import 'reflect-metadata'

import { StreamPartIDUtils } from '@streamr/protocol'
import { randomEthereumAddress } from '@streamr/test-utils'
import { collect } from '@streamr/utils'
import { once } from 'events'
import express from 'express'
import { AddressInfo } from 'net'
import { Resends } from '../../src/subscribe/Resends'
import { mockLoggerFactory } from '../test-utils/utils'

describe('Resends', () => {

    it('error handling', async () => {
        const app = express()
        app.get('/streams/:streamId/data/partitions/:partition/:resendType', async (_req, res) => {
            res.status(400).json({
                error: 'Mock error'
            })
        })
        const server = app.listen()
        await once(server, 'listening')
        const port = (server.address() as AddressInfo).port
        const serverUrl = `http://localhost:${port}`
        const resends = new Resends(
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
        const requestUrl = `${serverUrl}/streams/stream/data/partitions/0/last?count=1&format=raw`
        await expect(async () => {
            const messages = await resends.resend(StreamPartIDUtils.parse('stream#0'), { last: 1, raw: true })
            await collect(messages)
        }).rejects.toThrowStreamrError({
            message: `Storage node fetch failed: Mock error, httpStatus=400, url=${requestUrl}`,
            code: 'STORAGE_NODE_ERROR'
        })
        server.close()
    })
})
