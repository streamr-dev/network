/* eslint-disable no-console */

import KBucket from 'k-bucket'
import { SortedContactList } from '../../src/dht/contact/SortedContactList'
import { DhtAddress, DhtAddressRaw, randomDhtAddress, toDhtAddressRaw } from '../../src/identifiers'

const NUM_ADDS = 1000

interface Item {
    id: DhtAddressRaw
    vectorClock: number
    getNodeId: () => DhtAddress
}

const createRandomItem = (index: number): Item => {
    const nodeId = randomDhtAddress()
    const nodeIdRaw = toDhtAddressRaw(nodeId)
    return {
        getNodeId: () => nodeId,
        id: nodeIdRaw,
        vectorClock: index
    }
}

function shuffleArray<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[array[i], array[j]] = [array[j], array[i]]
    }
    return array
}

describe('SortedContactListBenchmark', () => {
    it('adds ' + NUM_ADDS + ' random nodeIds', async () => {
        const randomIds = []
        for (let i = 0; i < NUM_ADDS; i++) {
            randomIds.push(createRandomItem(i))
        }
        const list = new SortedContactList({
            referenceId: randomDhtAddress(),
            allowToContainReferenceId: true
        })

        console.time('SortedContactList.addContact()')
        for (let i = 0; i < NUM_ADDS; i++) {
            list.addContact(randomIds[i])
        }
        console.timeEnd('SortedContactList.addContact()')

        const kBucket = new KBucket<Item>({ localNodeId: toDhtAddressRaw(randomDhtAddress()) })
        console.time('KBucket.add()')
        for (let i = 0; i < NUM_ADDS; i++) {
            kBucket.add(randomIds[i])
        }
        console.timeEnd('KBucket.add()')

        console.time('kBucket toArray()')

        for (let i = 0; i < NUM_ADDS; i++) {
            kBucket.toArray()
        }
        console.timeEnd('kBucket toArray()')

        console.time('kBucket closest()')
        for (let i = 0; i < NUM_ADDS; i++) {
            kBucket.closest(toDhtAddressRaw(randomDhtAddress()), 20)
        }
        console.timeEnd('kBucket closest()')

        console.time('SortedContactList.getClosestContacts()')
        for (let i = 0; i < NUM_ADDS; i++) {
            const closest = new SortedContactList<Item>({
                referenceId: randomDhtAddress(),
                allowToContainReferenceId: true
            })

            const arrayFromBucket = kBucket.toArray()
            arrayFromBucket.forEach((contact) => closest.addContact(contact))
            closest.getClosestContacts(20)
        }
        console.timeEnd('SortedContactList.getClosestContacts()')

        console.time('SortedContactList.getClosestContacts() and addContacts()')
        for (let i = 0; i < NUM_ADDS; i++) {
            const closest = new SortedContactList<Item>({
                referenceId: randomDhtAddress(),
                allowToContainReferenceId: true
            })

            const arrayFromBucket = kBucket.toArray()
            closest.addContacts(arrayFromBucket)
            closest.getClosestContacts(20)
        }
        console.timeEnd('SortedContactList.getClosestContacts() and addContacts()')

        const shuffled = shuffleArray(kBucket.toArray())
        console.time('kbucket add and closest')
        for (let i = 0; i < NUM_ADDS; i++) {
            const bucket2 = new KBucket<Item>({ localNodeId: toDhtAddressRaw(randomDhtAddress()) })

            shuffled.forEach((contact) => bucket2.add(contact))
            bucket2.closest(toDhtAddressRaw(randomDhtAddress()), 20)
        }
        console.timeEnd('kbucket add and closest')
    })
})
