import 'reflect-metadata'

import merge from 'lodash/merge'
import { container } from 'tsyringe'
import type { StreamrClientConfig } from '../../src/ConfigTypes'
import { GroupKey } from '../../src/encryption/GroupKey'
import { StreamrClient } from '../../src/StreamrClient'

const createClient = (opts: StreamrClientConfig = {}) => {
    return new StreamrClient(merge(
        {
            environment: 'dev2'
        },
        opts
    ), container)
}

describe('StreamrClient', () => {

    describe('client id', () => {

        it('default', () => {
            const client = createClient()
            expect(client.id).toMatch(/[-a-z0-9]+/)
        })
        
        it('user defined', () => {
            const client = createClient({
                id: 'foobar'
            })
            expect(client.id).toBe('foobar')    
        })
    })

    describe('public API', () => {

        const client = createClient()

        it('updateEncryptionKey', async () => {
            await expect(() => {
                // @ts-expect-error invalid argument
                return client.updateEncryptionKey()
            }).rejects.toThrow('Cannot read properties of undefined (reading \'streamId\')') // TODO could throw better error message
            await expect(() => client.updateEncryptionKey({
                // @ts-expect-error invalid argument
                streamId: undefined,
                key: GroupKey.generate(),
                distributionMethod: 'rotate'
            })).rejects.toThrow('streamId')
        })
    })
})
