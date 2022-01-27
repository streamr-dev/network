import { randomBytes } from 'crypto'
import assert from 'assert'

import { verifyMessage } from '@ethersproject/wallet'
import Web3EthAccounts from 'web3-eth-accounts'
import secp256k1 from 'secp256k1'

import StreamMessage, {
    ContentType,
    EncryptionType,
    StreamMessageType
} from '../../src/protocol/message_layer/StreamMessage'
import StreamMessageValidator from '../../src/utils/StreamMessageValidator'
import '../../src/protocol/message_layer/StreamMessageSerializerV32'
import { MessageID, MessageRef, SigningUtil, toStreamID } from "../../src"

const mocks = {
    getStream: async () => ({
        partitions: 10,
        requireSignedData: true
    }),
    isPublisher: async () => true,
    isSubscriber: async () => true,
}

// @ts-expect-error figure out what is wrong with typing here
const accounts = new Web3EthAccounts()

describe('validate', () => {
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

    const run = async (functionToTest: () => void, name: string, iterations: number) => {
        const start = Date.now()

        let resultString = `Benchmarking ${name}...\n`

        for (let i = 0; i < iterations; i++) {
            // eslint-disable-next-line no-await-in-loop
            await functionToTest()
        }

        const end = Date.now() - start

        resultString += `Execution time: ${end} ms\n`
        resultString += `Iterations: ${iterations}\n`
        resultString += `Iterations / second: ${iterations / (end / 1000)}\n`
        const used: any = process.memoryUsage()
        Object.keys(used).forEach((key) => {
            /* eslint-disable no-mixed-operators */
            resultString += `${key} ${Math.round((used[key] as number) / 1024 / 1024 * 100) / 100} MB\n`
            /* eslint-enable no-mixed-operators */
        })
        console.info(resultString)
    }

    it('no signature checking at all', async () => {
        const validator = new StreamMessageValidator({
            verify: async () => true, // always pass
            ...mocks,
        })

        await run(() => validator.validate(streamMessage), 'no signature checking', 10000)
    })

    it('using ethers.js verifyMessage', async () => {
        const validator = new StreamMessageValidator({
            verify: async (addr: string, payload: string, signature: string) => {
                return verifyMessage(payload, signature).toLowerCase() === addr.toLowerCase()
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
