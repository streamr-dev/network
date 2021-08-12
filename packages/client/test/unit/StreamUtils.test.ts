import 'reflect-metadata'
import { createStreamId } from '../../src/StreamEndpoints'

describe('Stream utils', () => {
    describe('createStreamId', () => {
        const ownerProvider = () => Promise.resolve('0xaAAAaaaaAA123456789012345678901234567890')

        it('path', async () => {
            const path = '/foo/BAR'
            const actual = await createStreamId(path, ownerProvider)
            expect(actual).toBe('0xaaaaaaaaaa123456789012345678901234567890/foo/BAR')
        })

        it('path: no owner', () => {
            const path = '/foo/BAR'
            return expect(createStreamId(path, async () => undefined)).rejects.toThrowError('Owner missing for stream id: /foo/BAR')
        })

        it('path: no owner provider', () => {
            const path = '/foo/BAR'
            return expect(createStreamId(path, undefined)).rejects.toThrowError('Owner provider missing for stream id: /foo/BAR')
        })

        it('full: ethereum address', async () => {
            const id = '0xbbbbbBbBbB123456789012345678901234567890/foo/BAR'
            const actual = await createStreamId(id)
            expect(actual).toBe(id)
        })

        it('full: ENS domain', async () => {
            const id = 'example.eth/foo/BAR'
            const actual = await createStreamId(id)
            expect(actual).toBe(id)
        })

        it('legacy', async () => {
            const id = 'abcdeFGHJI1234567890ab'
            const actual = await createStreamId(id)
            expect(actual).toBe(id)
        })

        it('system', async () => {
            const id = 'SYSTEM/keyexchange/0xcccccccccc123456789012345678901234567890'
            const actual = await createStreamId(id)
            expect(actual).toBe(id)
        })

        it('undefined', () => {
            return expect(createStreamId(undefined as any)).rejects.toThrowError('Missing stream id')
        })
    })
})
