import { StreamPartIDUtils } from '@streamr/protocol'
import { fastWallet } from '@streamr/test-utils'
import { collect } from '@streamr/utils'
import { once } from 'events'
import express from 'express'
import range from 'lodash/range'
import { createQueryString, fetchHttpStream, getEndpointUrl } from '../../src/utils/utils'
import { createMockMessage } from '../test-utils/utils'

describe('utils', () => {

    describe('getEndpointUrl', () => {
        it('works', () => {
            const streamId = 'x/y'
            const url = getEndpointUrl('http://example.com', 'abc', streamId, 'def')
            expect(url.toLowerCase()).toBe('http://example.com/abc/x%2fy/def')
        })
    })

    it('query parameters with null/undefined', () => {
        const actual = createQueryString({
            a: 'foo',
            b: undefined,
            c: null,
            d: 123,
            e: ['x', 'y']
        })
        expect(actual).toBe('a=foo&d=123&e=x%2Cy')
    })

    it('fetchHttpStream', async () => {
        const MESSAGE_COUNT = 5
        const MOCK_SERVER_PORT = 12345
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
        const msgs = await collect(fetchHttpStream(`http://localhost:${MOCK_SERVER_PORT}/endpoint`, () => undefined as any))
        expect(msgs.map((m) => (m.getParsedContent() as any).mockId)).toEqual([0, 1, 2, 3, 4])
        server.close()
    })
})
