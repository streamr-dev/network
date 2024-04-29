import { Wallet } from 'ethers'
import { EthereumAddress, toEthereumAddress, hexToBinary } from '@streamr/utils'
import { StreamMessage, toStreamID, toStreamPartID } from '@streamr/protocol'
import { fastWallet } from '@streamr/test-utils'
import { StreamRegistry } from '../../src/contracts/StreamRegistry'
import { Stream } from '../../src/Stream'
import { validateStreamMessage } from '../../src/utils/validateStreamMessage'
import { createMockMessage } from '../test-utils/utils'

const publisherWallet = fastWallet()
const PARTITION_COUNT = 3

interface MessageOptions {
    partition?: number
    publisher?: Wallet
    signature?: Uint8Array
}

const validate = async (messageOptions: MessageOptions) => {
    let msg = await createMockMessage({
        streamPartId: toStreamPartID(toStreamID('streamId'), messageOptions.partition ?? 0),
        publisher: messageOptions.publisher ?? publisherWallet,
    })
    if (messageOptions.signature !== undefined) {
        msg = new StreamMessage({
            ...msg,
            signature: messageOptions.signature
        })
    }
    const streamRegistry: Pick<StreamRegistry, 'getStream' | 'isStreamPublisher'> = {
        getStream: async (): Promise<Stream> => ({
            getMetadata: () => ({
                partitions: PARTITION_COUNT
            })
        } as any),
        isStreamPublisher: async (_streamIdOrPath: string, userAddress: EthereumAddress) => {
            return userAddress === toEthereumAddress(publisherWallet.address)
        }
    }
    await validateStreamMessage(msg, streamRegistry as any, undefined as any)
}

describe('Validator', () => {

    describe('StreamMessage', () => {

        it('happy path', async () => {
            await validate({})
        })

        it('invalid partition', async () => {
            await expect(() => validate({
                partition: PARTITION_COUNT
            })).rejects.toThrow(`Partition ${PARTITION_COUNT} is out of range`)
        })

        it('invalid signature', async () => {
            await expect(() => validate({
                signature: hexToBinary('0x3333')
            })).rejects.toThrow('Signature validation failed')
        })

        it('invalid publisher', async () => {
            const otherWallet = Wallet.createRandom()
            await expect(() => validate({
                publisher: otherWallet
            })).rejects.toThrow('is not a publisher on stream streamId')
        })
    })
})
