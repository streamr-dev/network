import 'reflect-metadata'
import { StreamIDBuilder } from '../../src/StreamIDBuilder'
import Ethereum from '../../src/Ethereum'
import { KEY_EXCHANGE_STREAM_PREFIX } from 'streamr-client-protocol'

const address = '0xf5B45CC4cc510C31Cd6B64B8F4f341C283894086'
const normalizedAddress = address.toLowerCase()

describe('StreamIDBuilder', () => {
    let isAuthenticated: jest.Mock<boolean, []>
    let getAddress: jest.Mock<Promise<string>, []>
    let streamIdBuilder: StreamIDBuilder

    beforeEach(() => {
        isAuthenticated = jest.fn()
        getAddress = jest.fn()
        streamIdBuilder = new StreamIDBuilder({
            isAuthenticated,
            getAddress
        } as unknown as Ethereum)
    })

    describe('toStreamID', () => {
        it('legacy stream id', () => {
            expect(streamIdBuilder.toStreamID('7wa7APtlTq6EC5iTCBy6dw'))
                .resolves
                .toEqual('7wa7APtlTq6EC5iTCBy6dw')
        })

        it('key-exchange stream id', () => {
            expect(streamIdBuilder.toStreamID(KEY_EXCHANGE_STREAM_PREFIX + '0xABCdef12345'))
                .resolves
                .toEqual('SYSTEM/keyexchange/0xABCdef12345')
        })

        it('full stream id', () => {
            expect(streamIdBuilder.toStreamID(`${address}/foo/bar`))
                .resolves
                .toEqual(`${normalizedAddress}/foo/bar`)
        })

        it('throws if given path-only format but user not authenticated', () => {
            isAuthenticated.mockReturnValue(false)
            expect(streamIdBuilder.toStreamID('/foo/bar'))
                .rejects
                .toThrow('path-only format "/foo/bar" provided without address')
        })

        it('throws if given path-only format but ethereum address fetching rejects', () => {
            isAuthenticated.mockReturnValue(true)
            getAddress.mockRejectedValue(new Error('random error for getAddress'))
            expect(streamIdBuilder.toStreamID('/foo/bar'))
                .rejects
                .toThrow('random error for getAddress')
        })

        it('returns full stream id given path-only format if authenticated', () => {
            isAuthenticated.mockReturnValue(true)
            getAddress.mockResolvedValue(address)
            expect(streamIdBuilder.toStreamID('/foo/bar'))
                .resolves
                .toEqual(`${normalizedAddress}/foo/bar`)
        })
    })
})
