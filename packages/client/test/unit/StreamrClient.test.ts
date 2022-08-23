import 'reflect-metadata'
import { container } from 'tsyringe'
import { merge } from 'lodash'
import { StreamrClient } from '../../src/StreamrClient'
import { GroupKey } from '../../src/encryption/GroupKey'
import { ConfigTest } from '../../src'

describe('StreamrClient', () => {

    describe('public API', () => {

        const client = new StreamrClient(merge(
            {},
            ConfigTest,
            {
                network: {
                    trackers: [] // without this setting NetworkNodeFacade would query the tracker addresses from the contract
                }
            }
        ), container)

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
