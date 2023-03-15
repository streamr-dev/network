import { GroupKey } from '../../src/encryption/GroupKey'
import { GroupKeyStore } from '../../src/encryption/GroupKeyStore'
import { getGroupKeyStore } from '../test-utils/utils'
import { addAfterFn } from '../test-utils/jest-utils'
import LeakDetector from 'jest-leak-detector' // requires weak-napi
import { randomEthereumAddress } from '@streamr/test-utils'
import range from 'lodash/range'
import { EthereumAddress } from '@streamr/utils'

describe('GroupKeyStore', () => {
    
    let clientId: EthereumAddress
    let publisherId: EthereumAddress
    let store: GroupKeyStore
    let leakDetector: LeakDetector

    const addAfter = addAfterFn()

    beforeEach(() => {
        clientId = randomEthereumAddress()
        publisherId = randomEthereumAddress()
        store = getGroupKeyStore(clientId)
        leakDetector = new LeakDetector(store)
    })

    afterEach(async () => {
        await store.stop()
        // @ts-expect-error doesn't want us to unassign, but it's ok
        store = undefined // eslint-disable-line require-atomic-updates
    })

    afterEach(async () => {
        expect(await leakDetector.isLeaking()).toBeFalsy()
    })

    it('can get and set', async () => {
        const groupKey = GroupKey.generate()
        expect(await store.get(groupKey.id, publisherId)).toBeFalsy()

        await store.add(groupKey, publisherId)
        expect(await store.get(groupKey.id, publisherId)).toEqual(groupKey)
    })

    it('does not conflict with other streamIds', async () => {
        const groupKey = GroupKey.generate()
        await store.add(groupKey, publisherId)
        expect(await store.get(groupKey.id, publisherId)).toEqual(groupKey)
        expect(await store.get(groupKey.id, randomEthereumAddress())).toBeFalsy()
    })

    it('does not conflict with other clientIds', async () => {
        const clientId2 = randomEthereumAddress()
        const store2 = getGroupKeyStore(clientId2)

        addAfter(() => store2.stop())

        const groupKey = GroupKey.generate()
        await store.add(groupKey, publisherId)
        expect(await store2.get(groupKey.id, publisherId)).toBeFalsy()
        expect(await store.get(groupKey.id, publisherId)).toEqual(groupKey)
    })

    it('can read previously persisted data', async () => {
        const groupKey = GroupKey.generate()
        await store.add(groupKey, publisherId)

        const store2 = getGroupKeyStore(clientId)
        expect(await store2.get(groupKey.id, publisherId)).toEqual(groupKey)
    })

    it('add keys for multiple streams in parallel', async () => {
        const assignments = range(10).map(() => {
            return { key: GroupKey.generate(), publisherId: randomEthereumAddress() }
        })
        await Promise.all(assignments.map(({ key, publisherId }) => store.add(key, publisherId)))
        for (const assignment of assignments) {
            expect(await store.get(assignment.key.id, assignment.publisherId)).toEqual(assignment.key)
        }
    })
})
