import ControlMessage from '../../src/protocol/control_layer/ControlMessage'
import PublishRequestV1 from '../../src/protocol/control_layer/publish_request/PublishRequestV1'
import StreamMessageV31 from '../../src/protocol/message_layer/StreamMessageV31'

const ITERATIONS = 1000000

describe('deserialize()', () => {
    const run = (functionToTest, name) => {
        const json = '[1,8,[31,["kxeE-gyxS8CkuWYlfBKMVg",0,1567671580680,0,"0x8a9b2ca74d8c1c095d34de3f3cdd7462a5c9c9f4b84d11270a0ad885958bb963",' +
            '"7kcxFuyOs4ozeAcVfzJF"],[1567671579675,0],27,0,"{\\"random\\": 0.8314497807870005}",0,null],' +
            '"kuC8Ilzt2NURdpKxuYN2JBLkPQBJ0vN7NGIx5ohA7ZJafyh29I07fZR57Jq4fUBo"]'

        const start = new Date()
        const hrstart = process.hrtime()

        console.log(`Benchmarking ${name}...`)

        for (let i = 0; i < ITERATIONS; i++) {
            functionToTest(json)
        }

        const end = new Date() - start
        const hrend = process.hrtime(hrstart)

        console.info('Execution time: %dms', end)
        console.info('Execution time (hr): %ds %dms', hrend[0], hrend[1] / 1000000)
        const used = process.memoryUsage()
        Object.keys(used).forEach((key) => {
            /* eslint-disable no-mixed-operators */
            console.log(`${key} ${Math.round(used[key] / 1024 / 1024 * 100) / 100} MB`)
            /* eslint-enable no-mixed-operators */
        })
    }
    it('compare deserialize to other parsing functions', () => {
        run((json) => JSON.parse(json), 'JSON.parse')
        run((json) => ControlMessage.deserialize(json), 'ControlLayer.ControlMessage.deserialize')
        run((json) => ControlMessage.deserialize(json, false), 'ControlLayer.ControlMessage.deserialize without parsing content')
        const test = (msg) => {
            const messageArray = (typeof msg === 'string' ? JSON.parse(msg) : msg)
            const args = messageArray.slice(2)
            return new PublishRequestV1(new StreamMessageV31(...args[0].slice(1), false), args[1])
        }
        run((json) => test(json), 'new PublishRequestV1(new StreamMessageV31(...)) without parsing content')
    })
})
