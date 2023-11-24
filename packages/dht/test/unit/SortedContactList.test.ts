import { SortedContactList } from '../../src/dht/contact/SortedContactList'
import { PeerID } from '../../src/helpers/PeerID'

const createItem = (nodeId: Uint8Array): { getPeerId: () => PeerID } => {
    return { getPeerId: () => PeerID.fromValue(nodeId) }
}

describe('SortedContactList', () => {
    const item0 = createItem(new Uint8Array([0, 0, 0, 0]))
    const item1 = createItem(new Uint8Array([0, 0, 0, 1]))
    const item2 = createItem(new Uint8Array([0, 0, 0, 2]))
    const item3 = createItem(new Uint8Array([0, 0, 0, 3]))
    const item4 = createItem(new Uint8Array([0, 0, 0, 4]))

    it('compares Ids correctly', async () => {
        const list = new SortedContactList(item0.getPeerId(), 10)
        expect(list.compareIds(item0.getPeerId(), item0.getPeerId())).toBe(0)
        expect(list.compareIds(item1.getPeerId(), item1.getPeerId())).toBe(0)
        expect(list.compareIds(item0.getPeerId(), item1.getPeerId())).toBe(-1)
        expect(list.compareIds(item0.getPeerId(), item2.getPeerId())).toBe(-2)
        expect(list.compareIds(item1.getPeerId(), item0.getPeerId())).toBe(1)
        expect(list.compareIds(item2.getPeerId(), item0.getPeerId())).toBe(2)
        expect(list.compareIds(item2.getPeerId(), item3.getPeerId())).toBe(-1)
        expect(list.compareIds(item1.getPeerId(), item4.getPeerId())).toBe(-3)
    })
    
    it('orders itself correctly', async () => {
        const list = new SortedContactList(item0.getPeerId(), 10)
        list.addContact(item3)
        list.addContact(item2)
        list.addContact(item1)
        const contacts = list.getUncontactedContacts(3)
        expect(contacts.length).toEqual(3)
        expect(contacts[0]).toEqual(item1)
        expect(contacts[1]).toEqual(item2)
        expect(contacts[2]).toEqual(item3)
    })
    
    it('handles contacted nodes correctly', async () => {
        const list = new SortedContactList(item0.getPeerId(), 10)
        list.addContact(item3)
        list.addContact(item2)
        list.addContact(item1)
        list.setContacted(item2.getPeerId())
        const contacts = list.getUncontactedContacts(3)
        expect(contacts.length).toEqual(2)
        expect(contacts[0]).toEqual(item1)
        expect(contacts[1]).toEqual(item3)
    })

    it('cannot exceed maxSize', async () => {
        const list = new SortedContactList(item0.getPeerId(), 3)
        const onContactRemoved = jest.fn()
        list.on('contactRemoved', onContactRemoved)
        list.addContact(item1)
        list.addContact(item4)
        list.addContact(item3)
        list.addContact(item2)
        expect(list.getSize()).toEqual(3)
        expect(onContactRemoved).toBeCalledWith(item4, [item1, item2, item3])
        expect(list.getContact(item4.getPeerId())).toBeFalsy()
    })

    it('removing contacts', async () => {
        const list = new SortedContactList(item0.getPeerId(), 8)
        const onContactRemoved = jest.fn()
        list.on('contactRemoved', onContactRemoved)
        list.addContact(item4)
        list.addContact(item3)
        list.addContact(item2)
        list.addContact(item1)
        list.removeContact(item2.getPeerId())
        expect(list.getSize()).toEqual(3)
        expect(list.getContact(item2.getPeerId())).toBeFalsy()
        expect(list.getContactIds()).toEqual(list.getContactIds().sort(list.compareIds))
        expect(list.getAllContacts()).toEqual([item1, item3, item4])
        expect(onContactRemoved).toBeCalledWith(item2, [item1, item3, item4])
        const ret = list.removeContact(PeerID.fromValue(Buffer.from([0, 0, 0, 6])))
        expect(ret).toEqual(false)
    })

    it('get closes contacts', () => {
        const list = new SortedContactList(item0.getPeerId(), 8)
        list.addContact(item1)
        list.addContact(item3)
        list.addContact(item4)
        list.addContact(item2)
        expect(list.getClosestContacts(2)).toEqual([item1, item2])
        expect(list.getClosestContacts()).toEqual([item1, item2, item3, item4])
    })

    it('get active contacts', () => {
        const list = new SortedContactList(item0.getPeerId(), 8)
        list.addContact(item1)
        list.addContact(item3)
        list.addContact(item4)
        list.addContact(item2)
        list.setActive(item2.getPeerId())
        list.setActive(item3.getPeerId())
        list.setActive(item4.getPeerId())
        expect(list.getActiveContacts()).toEqual([item2, item3, item4])
    })
})
