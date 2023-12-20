/* eslint-disable no-console */

import KBucket from 'k-bucket'
import { SortedContactList } from '../../src/dht/contact/SortedContactList'
import crypto from 'crypto'
import { NodeID, getNodeIdFromBinary } from '../../src/helpers/nodeId'

const NUM_ADDS = 1000
interface Item {
    id: Uint8Array
    vectorClock: number
    getNodeId: () => NodeID
}

const createRandomItem = (index: number): Item => {
    const rand = new Uint8Array(crypto.randomBytes(20))
    return {
        getNodeId: () => getNodeIdFromBinary(rand),
        id: rand,
        vectorClock: index
    }
}

function shuffleArray<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]]
    }
    return array
}

describe('SortedContactListBenchmark', () => {

    it('adds ' + NUM_ADDS + ' random peerIDs', async () => {
        const randomIds = []
        for (let i = 0; i < NUM_ADDS; i++) {
            randomIds.push(createRandomItem(i))
        }
        const list = new SortedContactList({
            referenceId: getNodeIdFromBinary(crypto.randomBytes(20)),
            allowToContainReferenceId: true,
            emitEvents: true
        })

        console.time('SortedContactList.addContact() with emitEvents=true')
        for (let i = 0; i < NUM_ADDS; i++) {
            list.addContact(randomIds[i])
        }
        console.timeEnd('SortedContactList.addContact() with emitEvents=true')

        const list2 = new SortedContactList({
            referenceId: getNodeIdFromBinary(crypto.randomBytes(20)),
            allowToContainReferenceId: true,
            emitEvents: false
        })

        console.time('SortedContactList.addContact() with emitEvents=false')
        for (let i = 0; i < NUM_ADDS; i++) {
            list2.addContact(randomIds[i])
        }
        console.timeEnd('SortedContactList.addContact() with emitEvents=false')

        const kBucket = new KBucket<Item>({ localNodeId: crypto.randomBytes(20) })
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
            kBucket.closest(crypto.randomBytes(20), 20)
        }
        console.timeEnd('kBucket closest()')

        console.time('SortedContactList.getClosestContacts() with emitEvents=true')
        for (let i = 0; i < NUM_ADDS; i++) {
            const closest = new SortedContactList<Item>({
                referenceId: getNodeIdFromBinary(crypto.randomBytes(20)),
                allowToContainReferenceId: true,
                emitEvents: true
            })

            const arrayFromBucket = kBucket.toArray()
            arrayFromBucket.forEach((contact) => closest.addContact(contact))
            closest.getClosestContacts(20)
        }
        console.timeEnd('SortedContactList.getClosestContacts() with emitEvents=true')

        console.time('SortedContactList.getClosestContacts() with emitEvents=false')
        for (let i = 0; i < NUM_ADDS; i++) {
            const closest = new SortedContactList<Item>({
                referenceId: getNodeIdFromBinary(crypto.randomBytes(20)),
                allowToContainReferenceId: true,
                emitEvents: false
            })

            const arrayFromBucket = kBucket.toArray()
            arrayFromBucket.forEach((contact) => closest.addContact(contact))
            closest.getClosestContacts(20)
        }
        console.timeEnd('SortedContactList.getClosestContacts() with emitEvents=false')

        console.time('SortedContactList.getClosestContacts() with emitEvents=false and lodash')
        for (let i = 0; i < NUM_ADDS; i++) {
            const closest = new SortedContactList<Item>({
                referenceId: getNodeIdFromBinary(crypto.randomBytes(20)),
                allowToContainReferenceId: true,
                emitEvents: false
            })

            const arrayFromBucket = kBucket.toArray()
            arrayFromBucket.forEach((contact) => closest.addContact(contact))
            closest.getClosestContacts(20)
        }
        console.timeEnd('SortedContactList.getClosestContacts() with emitEvents=false and lodash')

        console.time('SortedContactList.getClosestContacts() with emitEvents=false and addContacts()')
        for (let i = 0; i < NUM_ADDS; i++) {
            const closest = new SortedContactList<Item>({
                referenceId: getNodeIdFromBinary(crypto.randomBytes(20)),
                allowToContainReferenceId: true,
                emitEvents: false
            })

            const arrayFromBucket = kBucket.toArray()
            closest.addContacts(arrayFromBucket)
            closest.getClosestContacts(20)
        }
        console.timeEnd('SortedContactList.getClosestContacts() with emitEvents=false and addContacts()')

        const shuffled = shuffleArray(kBucket.toArray())
        console.time('kbucket add and closest')
        for (let i = 0; i < NUM_ADDS; i++) {
            const bucket2 = new KBucket<Item>({ localNodeId: crypto.randomBytes(20) })

            shuffled.forEach((contact) => bucket2.add(contact))
            bucket2.closest(crypto.randomBytes(20), 20)
        }
        console.timeEnd('kbucket add and closest')

    })
})
