import { randomBytes } from 'crypto'
import assert from 'assert'

import { ethers } from 'ethers'
import Web3EthAccounts from 'web3-eth-accounts'
import secp256k1 from 'secp256k1'

import StreamMessage from '../../src/protocol/message_layer/StreamMessage'
import StreamMessageValidator from '../../src/utils/StreamMessageValidator'
import '../../src/protocol/message_layer/StreamMessageSerializerV31'

const privateKey = '5765eb50ed4eb3aeec7e4199e9c21f5b9d23336b65d31a60ac20bbdee7493bc8'
const address = '0xD12b87c9325eB36801d6114A0D5334AC2A8D25D8'
const streamMessage = StreamMessage.deserialize('[31,["tagHE6nTQ9SJV2wPoCxBFw",0,1587141844396,0,"0xD12b87c9325eB36801d6114A0D5334AC2A8D25D8","k000EDTMtqOTLM8sirFj"],[1587141844312,0],27,0,"{\\"eventType\\":\\"trade\\",\\"eventTime\\":1587141844398,\\"symbol\\":\\"ETHBTC\\",\\"tradeId\\":172530352,\\"price\\":0.02415,\\"quantity\\":0.296,\\"buyerOrderId\\":687544144,\\"sellerOrderId\\":687544104,\\"time\\":1587141844396,\\"maker\\":false,\\"ignored\\":true}",2,"0x31453f26d0fedbf2101f6a1535c8c1dc1646de809fcde3a1068dfda9e5d2af42105efd40fe26840f1cb1d81a8872180e5ff0b0404234e179bcd413ec2bbb8aa01b"]')

const mocks = {
    getStream: async () => ({
        partitions: 10,
        requireSignedData: true,
        requireEncryptedData: false,
    }),
    isPublisher: async () => true,
    isSubscriber: async () => true,
}

// @ts-ignore TODO
const accounts = new Web3EthAccounts()

describe('validate', () => {
    const run = async (functionToTest: () => void, name: string, iterations: number) => {
        const start = new Date()

        let resultString = `Benchmarking ${name}...\n`

        for (let i = 0; i < iterations; i++) {
            // eslint-disable-next-line no-await-in-loop
            await functionToTest()
        }

        // @ts-ignore TODO
        const end = new Date() - start

        resultString += `Execution time: ${end} ms\n`
        resultString += `Iterations: ${iterations}\n`
        resultString += `Iterations / second: ${iterations / (end / 1000)}\n`
        const used: any = process.memoryUsage()
        Object.keys(used).forEach((key) => {
            /* eslint-disable no-mixed-operators */
            resultString += `${key} ${Math.round((used[key] as number) / 1024 / 1024 * 100) / 100} MB\n`
            /* eslint-enable no-mixed-operators */
        })
        console.log(resultString)
    }

    it('no signature checking at all', async () => {
        const validator = new StreamMessageValidator({
            verify: async () => true, // always pass
            ...mocks,
        })

        await run(() => validator.validate(streamMessage), 'no signature checking', 10000)
    })

    it('using ethers.js', async () => {
        const validator = new StreamMessageValidator({
            verify: async (addr: string, payload: string, signature: string) => {
                return ethers.utils.verifyMessage(payload, signature).toLowerCase() === addr.toLowerCase()
            },
            ...mocks,
        })

        await run(() => validator.validate(streamMessage), 'using ethers.js', 100)
    })

    it('using web3.js', async () => {
        const validator = new StreamMessageValidator({
            verify: async (addr: string, payload: string, signature: string) => {
                return accounts.recover(payload, signature).toLowerCase() === addr.toLowerCase()
            },
            ...mocks,
        })

        await run(() => validator.validate(streamMessage), 'using web3.js', 100)
    })

    it('raw secp256k1', async () => {
        const msg = randomBytes(32)

        // generate privKey
        let privKey
        do {
            privKey = randomBytes(32)
        } while (!secp256k1.privateKeyVerify(privKey))

        // get the public key in a compressed format
        const pubKey = secp256k1.publicKeyCreate(privKey)

        // sign the message
        const sigObj = secp256k1.ecdsaSign(msg, privKey)
        // const sigObj = secp256k1.ecdsaSign(message, privateKey, {}, Buffer.alloc)

        const isValid = secp256k1.ecdsaVerify(sigObj.signature, msg, pubKey)
        assert(isValid)

        await run(() => {
            secp256k1.ecdsaVerify(sigObj.signature, msg, pubKey)
        }, 'raw secp256k1 (verify)', 10000)

        await run(() => {
            // @ts-ignore TODO
            secp256k1.ecdsaRecover(sigObj.signature, sigObj.recid, msg, true, Buffer.alloc)
        }, 'raw secp256k1 (recover)', 10000)
    })

    it('verify (our implementation)', async () => {
        const validator = new StreamMessageValidator({
            // use default value for 'verify'
            ...mocks,
        })

        await run(() => validator.validate(streamMessage), 'verify (our implementation)', 10000)
    })
})
