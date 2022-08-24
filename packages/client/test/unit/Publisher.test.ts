import 'reflect-metadata'
import { Authentication } from '../../src/Authentication'
import { Publisher } from '../../src/publish/Publisher'
import { StreamRegistryCached } from '../../src/registry/StreamRegistryCached'
import { StreamIDBuilder } from '../../src/StreamIDBuilder'
import { mockContext } from '../test-utils/utils'

describe('Publisher', () => {
    it('error message contains streamId and timestamp', async () => {
        const address = '0x1234567890123456789012345678901234567890'
        const authentication: Partial<Authentication> = {
            isAuthenticated: () => true,
            getAddress: async () => address
        }
        const streamIDBuilder = new StreamIDBuilder(authentication as any)
        const streamRegistry: Partial<StreamRegistryCached> = {
            getStream: (async () => {
                throw new Error('mock-error') 
            }) as any
        }
        const publisher = new Publisher(
            mockContext(),
            streamIDBuilder,
            authentication as any,
            streamRegistry as any,
            undefined as any,
            undefined as any,
            undefined as any,
            undefined as any
        )
        // eslint-disable-next-line max-len
        const expectedErrorMessage = /Failed to publish to stream 0x1234567890123456789012345678901234567890\/test \(timestamp=[0-9]+\), cause: mock-error/
        return expect(() => publisher.publish('/test', {})).rejects.toThrow(expectedErrorMessage)
    })
})
