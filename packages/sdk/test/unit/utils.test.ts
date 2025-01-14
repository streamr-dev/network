import { isRunningInElectron, startTestServer, testOnlyInNodeJs } from '@streamr/test-utils'
import { collect, toLengthPrefixedFrame, until } from '@streamr/utils'
import express from 'express'
import range from 'lodash/range'
import {
    FetchHttpStreamResponseError,
    createQueryString,
    fetchLengthPrefixedFrameHttpBinaryStream,
    getEndpointUrl
} from '../../src/utils/utils'
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

    describe('fetchLengthPrefixedFrameHttpBinaryStream', () => {
        it('happy path', async () => {
            const LINE_COUNT = 5
            const server = await startTestServer('/', async (_req: express.Request, res: express.Response) => {
                for (const i of range(LINE_COUNT)) {
                    res.write(toLengthPrefixedFrame(Buffer.from(`${i}`)))
                }
                res.end()
            })
            const lines = await collect(fetchLengthPrefixedFrameHttpBinaryStream(server.url))
            expect(lines.map((line) => parseInt(line.toString()))).toEqual(range(LINE_COUNT))
            await server.stop()
        })

        testOnlyInNodeJs('abort', async () => {
            let serverResponseClosed = false
            const server = await startTestServer('/', async (_req: express.Request, res: express.Response) => {
                res.on('close', () => {
                    serverResponseClosed = true
                })
                res.write(toLengthPrefixedFrame(Buffer.from('foobar')))
            })
            const abortController = new AbortController()
            const iterator = fetchLengthPrefixedFrameHttpBinaryStream(server.url, abortController.signal)[
                Symbol.asyncIterator
            ]()
            const line = await nextValue(iterator)
            expect(line?.toString()).toBe('foobar')
            abortController.abort()
            await until(() => serverResponseClosed === true)
            await expect(() => nextValue(iterator)).rejects.toThrow(/aborted/)
            await server.stop()
        })

        it('error response', async () => {
            const server = await startTestServer('/foo', async () => {})
            const iterator = fetchLengthPrefixedFrameHttpBinaryStream(`${server.url}/bar`)[Symbol.asyncIterator]()
            try {
                await nextValue(iterator)
                fail('Should throw')
            } catch (err) {
                expect(err).toBeInstanceOf(FetchHttpStreamResponseError)
                expect(err.response.status).toBe(404)
            }
            await server.stop()
        })

        it('invalid host', async () => {
            const iterator = fetchLengthPrefixedFrameHttpBinaryStream('http://mock.test')[Symbol.asyncIterator]()
            await expect(() => nextValue(iterator)).rejects.toThrow(
                isRunningInElectron() ? /failed to fetch/i : /fetch failed/i
            )
        })
    })
})
