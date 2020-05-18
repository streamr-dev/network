import { ethers } from 'ethers'
import Web3EthAccounts from 'web3-eth-accounts'

import StreamMessage from '../../src/protocol/message_layer/StreamMessage'
import StreamMessageValidator from '../../src/utils/StreamMessageValidator'
import '../../src/protocol/message_layer/StreamMessageSerializerV31'

const ITERATIONS = 100

const streamMessage = StreamMessage.deserialize('[31,["tagHE6nTQ9SJV2wPoCxBFw",0,1587141844396,0,"0xbce3217F2AC9c8a2D14A6303F87506c4FC124014","k000EDTMtqOTLM8sirFj"],[1587141844312,0],27,0,"{\\"eventType\\":\\"trade\\",\\"eventTime\\":1587141844398,\\"symbol\\":\\"ETHBTC\\",\\"tradeId\\":172530352,\\"price\\":0.02415,\\"quantity\\":0.296,\\"buyerOrderId\\":687544144,\\"sellerOrderId\\":687544104,\\"time\\":1587141844396,\\"maker\\":false,\\"ignored\\":true}",2,"0x91c47df28dc3014a49ef50313efa8e40015eeeccea0cf006ab2c7b05efbb0ddc7e10e430aaa7ea6dd0ca5e05761eaf0c14c8ca09b57c8d8626da7bb9ea2d50fa1b"]')

const defaults = {
    getStream: () => ({
        partitions: 10,
        requireSignedData: true,
        requireEncryptedData: false,
    }),
    isPublisher: () => true,
    isSubscriber: () => true,
}

const accounts = new Web3EthAccounts()

describe('validate', () => {
    const run = async (functionToTest, name) => {
        const start = new Date()

        let resultString = `Benchmarking ${name}...\n`

        for (let i = 0; i < ITERATIONS; i++) {
            // eslint-disable-next-line no-await-in-loop
            await functionToTest()
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

    it('no signature checking at all', async () => {
        const validator = new StreamMessageValidator({
            recoverAddress: () => streamMessage.getPublisherId(), // just return the publisherId instead of computing it
            ...defaults,
        })

        await run(() => validator.validate(streamMessage), 'no signature checking')
    })

    it('using ethers.js', async () => {
        const validator = new StreamMessageValidator({
            recoverAddress: (payload, signature) => {
                return ethers.utils.verifyMessage(payload, signature)
            },
            ...defaults,
        })

        await run(() => validator.validate(streamMessage), 'using ethers.js')
    })

    it('using web3.js', async () => {
        const validator = new StreamMessageValidator({
            recoverAddress: (payload, signature) => {
                return accounts.recover(payload, signature)
            },
            ...defaults,
        })

        await run(() => validator.validate(streamMessage), 'using web3.js')
    })
})
