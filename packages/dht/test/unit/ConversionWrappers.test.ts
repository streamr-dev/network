import { parseWrapper, serializeWrapper } from '../../src/rpc-protocol/ConversionWrappers'
import { PingRequest, RpcMessage } from '../../src/proto/DhtRpc'

describe('ConversionWrappers', () => {
    it('Parses successfully', () => {
        const ping: PingRequest = {
            nonce: 'conversionWrapper'
        }
        const binary = PingRequest.toBinary(ping)
        const parsed = parseWrapper<PingRequest>(() => PingRequest.fromBinary(binary))
        expect(parsed.nonce).toEqual('conversionWrapper')
    })

    it('Parsing throws on incorrect messages', () => {
        let errorCount = 0
        try {
            parseWrapper<PingRequest>(() => PingRequest.fromBinary(Buffer.from('adda')))
        } catch (err) {
            errorCount += 1
        }
        expect(errorCount).toEqual(1)
    })

    it('Serializing successfully', () => {
        const ping: PingRequest = {
            nonce: 'conversionWrapper'
        }
        const directSerialized = PingRequest.toBinary(ping)
        const serialized = serializeWrapper<PingRequest>(() => PingRequest.toBinary(ping))
        expect(Buffer.compare(directSerialized, serialized)).toEqual(0)
    })

    it('Serializing fails on incorrect messages', () => {
        let errorCount = 0
        try {
            serializeWrapper<PingRequest>(() =>
                PingRequest.toBinary(
                    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    {asd: "aaaaa"}
                )
            )

        } catch (err) {
            errorCount += 1
        }
        expect(errorCount).toEqual(1)
    })
})