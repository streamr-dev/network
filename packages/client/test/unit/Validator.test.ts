import 'reflect-metadata'

import { Wallet } from '@ethersproject/wallet'
import { EthereumAddress, toEthereumAddress } from '@streamr/utils'
import { toStreamID, toStreamPartID } from 'streamr-client-protocol'
import { fastWallet } from 'streamr-test-utils'
import { StreamRegistry } from '../../src/registry/StreamRegistry'
import { StreamRegistryCached } from '../../src/registry/StreamRegistryCached'
import { Stream } from '../../src/Stream'
import { Validator } from '../../src/Validator'
import { createMockMessage, mockLoggerFactory } from '../test-utils/utils'

const publisherWallet = fastWallet()
const PARTITION_COUNT = 3

const createMockValidator = () => {
    const streamRegistry: Pick<StreamRegistry, 'getStream' | 'isStreamPublisher'> = {
        getStream: async (): Promise<Stream> => {
            return {
                partitions: PARTITION_COUNT
            } as any
        },
        isStreamPublisher: async (_streamIdOrPath: string, userAddress: EthereumAddress) => {
            return userAddress === toEthereumAddress(publisherWallet.address)
        }
    }
    return new Validator(
        new StreamRegistryCached(mockLoggerFactory(), streamRegistry as any, {} as any) as any
    )
}

interface MessageOptions {
    partition?: number
    publisher?: Wallet
    signature?: string
}

const validate = async (messageOptions: MessageOptions) => {
    const validator = createMockValidator()
    const msg = await createMockMessage({
        streamPartId: toStreamPartID(toStreamID('streamId'), messageOptions.partition ?? 0),
        publisher: messageOptions.publisher ?? publisherWallet,
    })
    if (messageOptions.signature !== undefined) {
        msg.signature = messageOptions.signature
    }
    try {
        await validator.validate(msg)
    } finally {
        validator.stop()
    }
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
                signature: 'invalid-signature'
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

