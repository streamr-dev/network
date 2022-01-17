import {
    ContentType,
    EncryptionType,
    MessageLayer,
    toStreamID,
    SigningUtil,
    StreamMessageType,
    StreamMessage
} from '../../src'

const { MessageID, MessageRef } = MessageLayer

const ITERATIONS = 1000000

describe('deserialize', () => {
    let streamMessage: StreamMessage

    beforeAll(async () => {
        const address = '0xD5f5382ae72Cd43ca25768943814aA11E586E7F7'
        const privateKey = 'd1580cbfe3746587c58435f2308a3377d6cda21ab5e1f344c3cfc72dd5dbea6f'

        streamMessage = new StreamMessage({
            messageId: new MessageID(
                toStreamID('/foo/bar', address),
                0,
                1587141844396,
                0,
                address,
                'k000EDTMtqOTLM8sirFj'
            ),
            prevMsgRef: new MessageRef(1587141844312,0),
            // eslint-disable-next-line max-len
            content: "{\"eventType\":\"trade\",\"eventTime\":1587141844398,\"symbol\":\"ETHBTC\",\"tradeId\":172530352,\"price\":0.02415,\"quantity\":0.296,\"buyerOrderId\":687544144,\"sellerOrderId\":687544104,\"time\":1587141844396,\"maker\":false,\"ignored\":true}",
            messageType: StreamMessageType.MESSAGE,
            contentType: ContentType.JSON,
            encryptionType: EncryptionType.NONE,
            groupKeyId: null,
            newGroupKey: null,
            signatureType: StreamMessage.SIGNATURE_TYPES.ETH,
            signature: null,
        })
        // eslint-disable-next-line require-atomic-updates
        streamMessage.signature = await SigningUtil.sign(
            streamMessage.getPayloadToSign(StreamMessage.SIGNATURE_TYPES.ETH),
            privateKey
        )
    })

    const run = (functionToTest: () => void, name: string) => {
        const start = Date.now()

        let resultString = `Benchmarking ${name}...\n`

        for (let i = 0; i < ITERATIONS; i++) {
            functionToTest()
        }

        const end = Date.now() - start

        resultString += `Execution time: ${end} ms\n`
        resultString += `Iterations / second: ${ITERATIONS / (end / 1000)}\n`
        const used: any = process.memoryUsage()
        Object.keys(used).forEach((key) => {
            /* eslint-disable no-mixed-operators */
            resultString += `${key} ${Math.round((used[key] as number) / 1024 / 1024 * 100) / 100} MB\n`
            /* eslint-enable no-mixed-operators */
        })
        console.info(resultString)
    }

    it('StreamMessage', () => {
        const serializedStreamMessage = streamMessage.serialize()

        // JSON parsing only

        run(() => JSON.parse(serializedStreamMessage), 'JSON.parse(serializedStreamMessage)')

        // Object creation only

        run(() => {
            return new StreamMessage({
                messageId: new MessageID(
                    toStreamID('kxeE-gyxS8CkuWYlfBKMVg'),
                    0,
                    1567671580680,
                    0,
                    '0x8a9b2ca74d8c1c095d34de3f3cdd7462a5c9c9f4b84d11270a0ad885958bb963',
                    '7kcxFuyOs4ozeAcVfzJF'
                ),
                prevMsgRef: new MessageRef(1567671579675, 0),
                content: '{"random": 0.8314497807870005}',
            })
        }, 'new StreamMessage({...})')

        // Whole thing

        run(() => StreamMessage.deserialize(serializedStreamMessage), 'StreamMessage.deserialize(serializedStreamMessage)')
    })
})
