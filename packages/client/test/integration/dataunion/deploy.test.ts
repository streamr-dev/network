import debug from 'debug'

import { StreamrClient } from '../../../src/StreamrClient'
import clientOptions from '../config'
import { createMockAddress } from '../../utils'

const log = debug('StreamrClient::DataUnion::integration-test-deploy')

describe('DataUnion deploy', () => {

    let adminClient: StreamrClient

    beforeAll(async () => {
        log('ClientOptions: %O', clientOptions)
        adminClient = new StreamrClient(clientOptions as any)
    }, 60000)

    describe('owner', () => {

        it('not specified: defaults to deployer', async () => {
            const dataUnion = await adminClient.deployDataUnion()
            expect(await dataUnion.getAdminAddress()).toBe(await adminClient.getAddress())
        }, 60000)

        it('specified', async () => {
            const owner = createMockAddress()
            const dataUnion = await adminClient.deployDataUnion({ owner })
            expect(await dataUnion.getAdminAddress()).toBe(owner)
        }, 60000)

        it('invalid', () => {
            return expect(() => adminClient.deployDataUnion({ owner: 'foobar' })).rejects.toThrow('invalid address')
        }, 60000)

    })
})

