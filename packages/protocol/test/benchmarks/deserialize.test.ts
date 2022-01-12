import { MessageLayer, StreamIDUtils } from '../../src'

const { StreamMessage, MessageID, MessageRef } = MessageLayer

const ITERATIONS = 1000000

// eslint-disable-next-line max-len
const streamMessage = StreamMessage.deserialize('[31,["kxeE-gyxS8CkuWYlfBKMVg",0,1567671580680,0,"0x8a9b2ca74d8c1c095d34de3f3cdd7462a5c9c9f4b84d11270a0ad885958bb963",'
    + '"7kcxFuyOs4ozeAcVfzJF"],[1567671579675,0],27,0,"{\\"random\\": 0.8314497807870005}",0,null]')

describe('deserialize', () => {
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
                    StreamIDUtils.toStreamID('kxeE-gyxS8CkuWYlfBKMVg'),
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
