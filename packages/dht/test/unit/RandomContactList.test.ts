import { RandomContactList } from '../../src/dht/contact/RandomContactList'
import { PeerID } from '../../src/helpers/PeerID'

const createItem = (kademliaId: Uint8Array): { getPeerId: () => PeerID } => {
    return { getPeerId: () => PeerID.fromValue(kademliaId) }
}

describe('RandomContactList', () => {
    const item0 = createItem(new Uint8Array([0, 0, 0, 0]))
    const item1 = createItem(new Uint8Array([0, 0, 0, 1]))
    const item2 = createItem(new Uint8Array([0, 0, 0, 2]))
    const item3 = createItem(new Uint8Array([0, 0, 0, 3]))
    const item4 = createItem(new Uint8Array([0, 0, 0, 4]))

    it('adds contacts correctly', () => {
        const list = new RandomContactList(item0.getPeerId(), 5, 1)
        list.addContact(item1)
        list.addContact(item2)
        list.addContact(item3)
        list.addContact(item3)
        list.addContact(item4)
        list.addContact(item4)
        expect(list.getSize()).toEqual(4)
        expect(list.getContacts()).toEqual(
            [item1, item2, item3, item4]
        )
    })

    it('removes contacts correctly', () => {
        const list = new RandomContactList(item0.getPeerId(), 5, 1)
        list.addContact(item1)
        list.addContact(item2)
        list.addContact(item3)
        list.addContact(item4)
        list.removeContact(item2.getPeerId())
        expect(list.getContact(item1.getPeerId())).toBeTruthy()
        expect(list.getContact(item3.getPeerId())).toBeTruthy()
        expect(list.getContact(item4.getPeerId())).toBeTruthy()
        expect(list.getContacts()).toEqual(
            [item1, item3, item4]
        )
        expect(list.getSize()).toEqual(3)
    })

})
