import 'reflect-metadata'

import { fastWallet } from '@streamr/test-utils'
import { hexToBinary, toStreamID, toStreamPartID, UserID } from '@streamr/utils'
import { Wallet } from 'ethers'
import { mock } from 'jest-mock-extended'
import { StreamMetadata } from '../../src/StreamMetadata'
import { ERC1271ContractFacade } from '../../src/contracts/ERC1271ContractFacade'
import { StreamRegistry } from '../../src/contracts/StreamRegistry'
import { SignatureValidator } from '../../src/signature/SignatureValidator'
import { validateStreamMessage } from '../../src/utils/validateStreamMessage'
import { createMockMessage } from '../test-utils/utils'
import { StreamMessage } from './../../src/protocol/StreamMessage'

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
        publisher: messageOptions.publisher ?? publisherWallet
    })
    if (messageOptions.signature !== undefined) {
        msg = new StreamMessage({
            ...msg,
            signature: messageOptions.signature
        })
    }
    const streamRegistry: Pick<StreamRegistry, 'getStreamMetadata' | 'isStreamPublisher'> = {
        getStreamMetadata: async (): Promise<StreamMetadata> => ({
            partitions: PARTITION_COUNT
        }),
        isStreamPublisher: async (_streamIdOrPath: string, userId: UserID) => {
            return userId === publisherWallet.address.toLowerCase()
        }
    }
    await validateStreamMessage(msg, streamRegistry as any, new SignatureValidator(mock<ERC1271ContractFacade>()))
}

describe('Validator', () => {
    describe('StreamMessage', () => {
        it('happy path', async () => {
            await validate({})
        })

        it('invalid partition', async () => {
            await expect(() =>
                validate({
                    partition: PARTITION_COUNT
                })
            ).rejects.toThrow(`Partition ${PARTITION_COUNT} is out of range`)
        })

        it('invalid signature', async () => {
            await expect(() =>
                validate({
                    signature: hexToBinary('0x3333')
                })
            ).rejects.toThrow('Signature validation failed')
        })

        it('invalid publisher', async () => {
            const otherWallet = fastWallet()
            await expect(() =>
                validate({
                    publisher: otherWallet
                })
            ).rejects.toThrow('is not a publisher on stream streamId')
        })
    })
})
