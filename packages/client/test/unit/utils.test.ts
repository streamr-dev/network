import { StreamPartIDUtils } from '@streamr/protocol'
import { fastWallet, startTestServer } from '@streamr/test-utils'
import { collect } from '@streamr/utils'
import { Request, Response } from 'express'
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
        const server = await startTestServer('/', async (_req: Request, res: Response) => {
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
        const msgs = await collect(fetchHttpStream(server.url, () => undefined as any))
        expect(msgs.map((m) => (m.getParsedContent() as any).mockId)).toEqual(range(MESSAGE_COUNT))
        await server.stop()
    })
})
