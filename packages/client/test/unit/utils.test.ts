import { collect, waitForCondition } from '@streamr/utils'
import { Request, Response } from 'express'
import range from 'lodash/range'
import { createQueryString, fetchHttpStream, getEndpointUrl } from '../../src/utils/utils'
import { startTestServer } from '../test-utils/utils'
import { nextValue } from './../../src/utils/iterators'

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

    describe('fetchHttpStream', () => {

        it('happy path', async () => {
            const LINE_COUNT = 5
            const server = await startTestServer('/', async (_req: Request, res: Response) => {
                for (const i of range(LINE_COUNT)) {
                    res.write(`${i}\n`)
                }
                res.end()
            })
            const lines = await collect(fetchHttpStream(server.url, () => undefined as any))
            expect(lines.map((line) => parseInt(line))).toEqual(range(LINE_COUNT))
            await server.stop()
        })

        it('abort', async () => {
            let serverResponseClosed = false
            const server = await startTestServer('/', async (_req: Request, res: Response) => {
                res.on('close', () => {
                    serverResponseClosed = true
                })
                res.write(`foobar\n`)
            })
            const abortController = new AbortController()
            const iterator = fetchHttpStream(server.url, () => undefined as any, abortController)[Symbol.asyncIterator]()
            const line = await nextValue(iterator)
            expect(line).toBe('foobar')
            abortController.abort()
            await waitForCondition(() => serverResponseClosed === true)
            await expect(() => nextValue(iterator)).rejects.toThrow(/aborted/)
            await server.stop()
        })
    })
})
