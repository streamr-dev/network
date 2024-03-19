import 'reflect-metadata'

import { Publisher } from '../../src/publish/Publisher'
import { StreamIDBuilder } from '../../src/StreamIDBuilder'
import { createGroupKeyManager, createRandomAuthentication } from '../test-utils/utils'
import { PublisherKeyExchange } from '../../src/encryption/PublisherKeyExchange'
import { mock } from 'jest-mock-extended'
import { ERC1271ContractFacade } from '../../src/contracts/ERC1271ContractFacade'

describe('Publisher', () => {
    it('error message', async () => {
        const authentication = createRandomAuthentication()
        const streamIdBuilder = new StreamIDBuilder(authentication)
        const streamRegistry = {
            isStreamPublisher: async () => false,
            clearStreamCache: () => {}
        }
        const publisher = new Publisher(
            undefined as any,
            streamRegistry as any,
            createGroupKeyManager(undefined, authentication),
            streamIdBuilder,
            authentication,
            mock<PublisherKeyExchange>(),
            mock<ERC1271ContractFacade>()
        )
        const streamId = await streamIdBuilder.toStreamID('/test')
        await expect(async () => {
            await publisher.publish(streamId, {})
        }).rejects.toThrowStreamrError({
            code: 'MISSING_PERMISSION',
            // eslint-disable-next-line max-len
            message: `Failed to publish to stream ${streamId}. Cause: You don't have permission to publish to this stream. Using address: ${await authentication.getAddress()}`
        })
    })
})
