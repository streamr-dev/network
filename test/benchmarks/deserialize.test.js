import ControlMessage from '../../src/protocol/control_layer/ControlMessage'
import PublishRequestSerializerV1 from '../../src/protocol/control_layer/publish_request/PublishRequestSerializerV1'
import PublishRequest from '../../src/protocol/control_layer/publish_request/PublishRequest'
import StreamMessage from '../../src/protocol/message_layer/StreamMessage'
import MessageID from '../../src/protocol/message_layer/MessageID'
import MessageRef from '../../src/protocol/message_layer/MessageRef'
import StreamMessageSerializerV31 from '../../src/protocol/message_layer/StreamMessageSerializerV31'

const ITERATIONS = 1000000

const publishRequest = ControlMessage.deserialize('[1,8,[31,["kxeE-gyxS8CkuWYlfBKMVg",0,1567671580680,0,"0x8a9b2ca74d8c1c095d34de3f3cdd7462a5c9c9f4b84d11270a0ad885958bb963",'
    + '"7kcxFuyOs4ozeAcVfzJF"],[1567671579675,0],27,0,"{\\"random\\": 0.8314497807870005}",0,null],'
    + '"kuC8Ilzt2NURdpKxuYN2JBLkPQBJ0vN7NGIx5ohA7ZJafyh29I07fZR57Jq4fUBo"]')

const { streamMessage } = publishRequest

describe('deserialize', () => {
    const run = (functionToTest, name) => {
        const start = new Date()

        let resultString = `Benchmarking ${name}...\n`

        for (let i = 0; i < ITERATIONS; i++) {
            functionToTest()
        }

        const end = new Date() - start

        resultString += `Execution time: ${end} ms\n`
        resultString += `Iterations / second: ${ITERATIONS / (end / 1000)}\n`
        const used = process.memoryUsage()
        Object.keys(used).forEach((key) => {
            /* eslint-disable no-mixed-operators */
            resultString += `${key} ${Math.round(used[key] / 1024 / 1024 * 100) / 100} MB\n`
            /* eslint-enable no-mixed-operators */
        })
        console.log(resultString)
    }

    it('StreamMessage', () => {
        const serializedStreamMessage = streamMessage.serialize()

        // JSON parsing only

        run(() => JSON.parse(serializedStreamMessage), 'JSON.parse(serializedStreamMessage)')

        // Object creation only

        run(() => {
            return new StreamMessage(
                new MessageID('kxeE-gyxS8CkuWYlfBKMVg', 0, 1567671580680, 0, '0x8a9b2ca74d8c1c095d34de3f3cdd7462a5c9c9f4b84d11270a0ad885958bb963', '7kcxFuyOs4ozeAcVfzJF'),
                new MessageRef(1567671579675, 0),
                '{"random": 0.8314497807870005}',
                StreamMessage.CONTENT_TYPES.MESSAGE,
                StreamMessage.ENCRYPTION_TYPES.NONE,
                StreamMessage.SIGNATURE_TYPES.NONE
            )
        }, 'new StreamMessage(...)')

        // Decomposition and object creation

        const preParsedJson = JSON.parse(serializedStreamMessage)
        run(() => {
            return StreamMessageSerializerV31.fromArray(preParsedJson)
        }, 'PublishRequestSerializerV1.fromArray(preParsedJson)')

        // Whole thing

        run(() => StreamMessage.deserialize(serializedStreamMessage), 'StreamMessage.deserialize(serializedStreamMessage)')
    })

    it('PublishRequest', () => {
        const serializedPublishRequest = publishRequest.serialize()

        // JSON parsing only

        run(() => JSON.parse(serializedPublishRequest), 'JSON.parse(serializedPublishRequest)')

        // Object creation only

        run(() => {
            return new PublishRequest(2, 'requestId', streamMessage, 'sessionToken')
        }, 'new PublishRequest(...) with ready-made StreamMessage')

        // Decomposition and object creation

        const preParsedJson = JSON.parse(serializedPublishRequest)
        run(() => {
            return PublishRequestSerializerV1.fromArray(preParsedJson)
        }, 'PublishRequestSerializerV1.fromArray(messageArray) with pre-parsed JSON')

        // Whole thing
        run(() => ControlMessage.deserialize(serializedPublishRequest), 'ControlMessage.deserialize(serializedPublishRequest)')
    })
})
