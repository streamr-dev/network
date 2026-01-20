import 'reflect-metadata'

import { mock } from 'jest-mock-extended'
import { Publisher } from '../../src/publish/Publisher'
import { MessageSigner } from '../../src/signature/MessageSigner'
import { SignatureValidator } from '../../src/signature/SignatureValidator'
import { StreamIDBuilder } from '../../src/StreamIDBuilder'
import { createGroupKeyManager, createRandomIdentity } from '../test-utils/utils'
import type { StrictStreamrClientConfig } from '../../src/ConfigTypes'

describe('Publisher', () => {
    it('error message', async () => {
        const identity = await createRandomIdentity()
        const streamIdBuilder = new StreamIDBuilder(identity)
        const streamRegistry = {
            isStreamPublisher: async () => false,
            invalidatePermissionCaches: () => {}
        }
        const publisher = new Publisher(
            undefined as any,
            streamRegistry as any,
            await createGroupKeyManager(identity),
            streamIdBuilder,
            identity,
            mock<SignatureValidator>(),
            mock<MessageSigner>(),
            {
                encryption: {},
                validation: {
                    permissions: true,
                    partitions: true,
                }
            } as StrictStreamrClientConfig,
        )
        const streamId = await streamIdBuilder.toStreamID('/test')
        await expect(async () => {
            await publisher.publish(streamId, {})
        }).rejects.toThrowStreamrClientError({
            code: 'MISSING_PERMISSION',
            // eslint-disable-next-line max-len
            message: `Failed to publish to stream ${streamId}. Cause: You don't have permission to publish to this stream. Using address: ${await identity.getUserId()}`
        })
    })
})
