import 'reflect-metadata'

import { once } from 'events'
import express from 'express'
import range from 'lodash/range'
import { StreamPartIDUtils } from '@streamr/protocol'
import { fastWallet } from '@streamr/test-utils'
import { HttpUtil } from '../../src/HttpUtil'
import { collect } from '../../src/utils/iterators'
import { createMockMessage, mockLoggerFactory } from '../test-utils/utils'

const MOCK_SERVER_PORT = 12345

describe('HttpUtil', () => {

    it('fetchHttpStream', async () => {
        const MESSAGE_COUNT = 5
        const app = express()
        app.get('/endpoint', async (_req, res) => {
            const publisher = fastWallet()
            for (const i of range(MESSAGE_COUNT)) {
                const msg = await createMockMessage({
                    streamPartId: StreamPartIDUtils.parse('stream#0'),
                    publisher,
                    content: {
                        mockId: i
                    }
                })
                res.write(`${msg.serialize()}\n`)
            }
            res.end()
        })
        const server = app.listen(MOCK_SERVER_PORT)
        await once(server, 'listening')
        const httpUtil = new HttpUtil(mockLoggerFactory())
        const msgs = await collect(httpUtil.fetchHttpStream(`http://localhost:${MOCK_SERVER_PORT}/endpoint`))
        expect(msgs.map((m) => (m.getParsedContent() as any).mockId)).toEqual([0, 1, 2, 3, 4])
        server.close()
    })

    it('query parameters with null/undefined', () => {
        const httpUtil = new HttpUtil(mockLoggerFactory())
        const actual = httpUtil.createQueryString({
            a: 'foo',
            b: undefined,
            c: null,
            d: 123,
            e: ['x', 'y']
        })
        expect(actual).toBe('a=foo&d=123&e=x%2Cy')
    })
})
