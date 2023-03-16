import { GroupKey } from '../../src/encryption/GroupKey'
import { GroupKeyStore } from '../../src/encryption/GroupKeyStore'
import { getGroupKeyStore } from '../test-utils/utils'
import { randomEthereumAddress } from '@streamr/test-utils'
import range from 'lodash/range'
import { EthereumAddress } from '@streamr/utils'

describe('GroupKeyStore', () => {
    
    let clientId: EthereumAddress
    let publisherId: EthereumAddress
    let store: GroupKeyStore
    let store2: GroupKeyStore

    beforeEach(() => {
        clientId = randomEthereumAddress()
        publisherId = randomEthereumAddress()
        store = getGroupKeyStore(clientId)
    })

    afterEach(async () => {
        await store?.stop()
        await store2?.stop()
        // @ts-expect-error doesn't want us to unassign, but it's ok
        store = undefined // eslint-disable-line require-atomic-updates
        // @ts-expect-error doesn't want us to unassign, but it's ok
        store2 = undefined // eslint-disable-line require-atomic-updates
    })

    it('can get and set', async () => {
        const groupKey = GroupKey.generate()
        expect(await store.get(groupKey.id, publisherId)).toBeUndefined()

        await store.add(groupKey, publisherId)
        expect(await store.get(groupKey.id, publisherId)).toEqual(groupKey)
    })

    it('key lookup is publisher specific', async () => {
        const groupKey = GroupKey.generate()
        await store.add(groupKey, publisherId)
        expect(await store.get(groupKey.id, publisherId)).toEqual(groupKey)
        expect(await store.get(groupKey.id, randomEthereumAddress())).toBeUndefined()
    })

    it('key stores are clientId specific', async () => {
        const clientId2 = randomEthereumAddress()
        store2 = getGroupKeyStore(clientId2)

        const groupKey = GroupKey.generate()
        await store.add(groupKey, publisherId)
        expect(await store2.get(groupKey.id, publisherId)).toBeUndefined()
        expect(await store.get(groupKey.id, publisherId)).toEqual(groupKey)
    })

    it('can read previously persisted data', async () => {
        const groupKey = GroupKey.generate()
        await store.add(groupKey, publisherId)

        const store2 = getGroupKeyStore(clientId)
        expect(await store2.get(groupKey.id, publisherId)).toEqual(groupKey)
    })

    it('add multiple keys in parallel', async () => {
        const assignments = range(10).map(() => {
            return { key: GroupKey.generate(), publisherId: randomEthereumAddress() }
        })
        await Promise.all(assignments.map(({ key, publisherId }) => store.add(key, publisherId)))
        for (const assignment of assignments) {
            expect(await store.get(assignment.key.id, assignment.publisherId)).toEqual(assignment.key)
        }
    })
})
