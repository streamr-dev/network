import 'reflect-metadata'

import { StreamPartIDUtils, toUserId } from '@streamr/utils'
import { Authentication } from '../../src/Authentication'
import { StreamIDBuilder } from '../../src/StreamIDBuilder'
import { StreamDefinition } from '../../src/types'

const address = '0xf5B45CC4cc510C31Cd6B64B8F4f341C283894086'
const normalizedAddress = address.toLowerCase()

describe('StreamIDBuilder', () => {
    let getUserId: jest.Mock<Promise<string>, []>
    let streamIdBuilder: StreamIDBuilder

    beforeEach(() => {
        getUserId = jest.fn()
        streamIdBuilder = new StreamIDBuilder({
            getUserId
        } as unknown as Authentication)
    })

    describe('toStreamID', () => {
        it('legacy stream id', () => {
            return expect(streamIdBuilder.toStreamID('7wa7APtlTq6EC5iTCBy6dw')).resolves.toEqual(
                '7wa7APtlTq6EC5iTCBy6dw'
            )
        })

        it('full stream id', () => {
            return expect(streamIdBuilder.toStreamID(`${address}/foo/bar`)).resolves.toEqual(
                `${normalizedAddress}/foo/bar`
            )
        })

        it('throws if given path-only format but ethereum address fetching rejects', () => {
            getUserId.mockRejectedValue(new Error('random error for getUserId'))
            return expect(streamIdBuilder.toStreamID('/foo/bar')).rejects.toThrow('random error for getUserId')
        })

        it('returns full stream id given path-only format', () => {
            getUserId.mockResolvedValue(toUserId(address))
            return expect(streamIdBuilder.toStreamID('/foo/bar')).resolves.toEqual(`${normalizedAddress}/foo/bar`)
        })
    })

    const DEFINITIONS_WITHOUT_PARTITION: StreamDefinition[] = [
        'test.eth/foo/bar',
        { id: 'test.eth/foo/bar' },
        { streamId: 'test.eth/foo/bar' },
        { stream: 'test.eth/foo/bar' }
    ]

    const DEFINITIONS_WITH_PARTITION: StreamDefinition[] = [
        'test.eth/foo/bar#66',
        { id: 'test.eth/foo/bar', partition: 66 },
        { streamId: 'test.eth/foo/bar', partition: 66 },
        { stream: 'test.eth/foo/bar', partition: 66 }
    ]

    describe('toStreamPartID', () => {
        it.each(DEFINITIONS_WITHOUT_PARTITION)('given %s as string definition (default partition)', (definition) => {
            return expect(streamIdBuilder.toStreamPartID(definition)).resolves.toEqual('test.eth/foo/bar#0')
        })

        it.each(DEFINITIONS_WITH_PARTITION)('given %s as string part definition', (definition) => {
            return expect(streamIdBuilder.toStreamPartID(definition)).resolves.toEqual('test.eth/foo/bar#66')
        })
    })

    describe('toStreamPartElements', () => {
        it.each(DEFINITIONS_WITHOUT_PARTITION)('given %s as string definition', (definition) => {
            return expect(streamIdBuilder.toStreamPartElements(definition)).resolves.toEqual([
                'test.eth/foo/bar',
                undefined
            ])
        })

        it.each(DEFINITIONS_WITH_PARTITION)('given %s as string part definition', (definition) => {
            return expect(streamIdBuilder.toStreamPartElements(definition)).resolves.toEqual(['test.eth/foo/bar', 66])
        })
    })

    describe('getMatcher', () => {
        const fullMatch = StreamPartIDUtils.parse('test.eth/foo/bar#66')
        const streamOnlyMatch = StreamPartIDUtils.parse('test.eth/foo/bar#3')
        const noMatch = StreamPartIDUtils.parse('streamr.eth/foo/bar#66')

        it.each(DEFINITIONS_WITHOUT_PARTITION)('given %s as string definition', async (definition) => {
            const matcher = await streamIdBuilder.getMatcher(definition)
            expect(matcher(fullMatch)).toBe(true)
            expect(matcher(streamOnlyMatch)).toBe(true)
            expect(matcher(noMatch)).toBe(false)
        })

        it.each(DEFINITIONS_WITH_PARTITION)('given %s as string part definition', async (definition) => {
            const matcher = await streamIdBuilder.getMatcher(definition)
            expect(matcher(fullMatch)).toBe(true)
            expect(matcher(streamOnlyMatch)).toBe(false)
            expect(matcher(noMatch)).toBe(false)
        })
    })
})
