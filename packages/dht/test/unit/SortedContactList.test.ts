import { SortedContactList } from '../../src/dht/contact/SortedContactList'
import { DhtAddress, DhtAddressRaw, randomDhtAddress, toDhtAddress } from '../../src/identifiers'

const createItem = (nodeId: DhtAddressRaw): { getNodeId: () => DhtAddress } => {
    return {
        getNodeId: () => toDhtAddress(nodeId)
    }
}

describe('SortedContactList', () => {
    const item0 = createItem(new Uint8Array([0, 0, 0, 0]))
    const item1 = createItem(new Uint8Array([0, 0, 0, 1]))
    const item2 = createItem(new Uint8Array([0, 0, 0, 2]))
    const item3 = createItem(new Uint8Array([0, 0, 0, 3]))
    const item4 = createItem(new Uint8Array([0, 0, 0, 4]))

    it('compares Ids correctly', async () => {
        const list = new SortedContactList({
            referenceId: item0.getNodeId(),
            maxSize: 10,
            allowToContainReferenceId: true
        })
        expect(list.compareIds(item0.getNodeId(), item0.getNodeId())).toBe(0)
        expect(list.compareIds(item1.getNodeId(), item1.getNodeId())).toBe(0)
        expect(list.compareIds(item0.getNodeId(), item1.getNodeId())).toBe(-1)
        expect(list.compareIds(item0.getNodeId(), item2.getNodeId())).toBe(-2)
        expect(list.compareIds(item1.getNodeId(), item0.getNodeId())).toBe(1)
        expect(list.compareIds(item2.getNodeId(), item0.getNodeId())).toBe(2)
        expect(list.compareIds(item2.getNodeId(), item3.getNodeId())).toBe(-1)
        expect(list.compareIds(item1.getNodeId(), item4.getNodeId())).toBe(-3)
    })

    it('cannot exceed maxSize', async () => {
        const list = new SortedContactList({
            referenceId: item0.getNodeId(),
            maxSize: 3,
            allowToContainReferenceId: false
        })
        const onContactRemoved = jest.fn()
        list.on('contactRemoved', onContactRemoved)
        list.addContact(item1)
        list.addContact(item4)
        list.addContact(item3)
        list.addContact(item2)
        expect(list.getSize()).toEqual(3)
        expect(list.getClosestContacts()).toEqual([item1, item2, item3])
        expect(list.getContactIds()).toEqual([item1.getNodeId(), item2.getNodeId(), item3.getNodeId()])
        expect(onContactRemoved).toHaveBeenCalledWith(item4)
        expect(list.getContact(item4.getNodeId())).toBeFalsy()
    })

    it('removing contacts', async () => {
        const list = new SortedContactList({
            referenceId: item0.getNodeId(),
            maxSize: 8,
            allowToContainReferenceId: false
        })
        const onContactRemoved = jest.fn()
        list.on('contactRemoved', onContactRemoved)
        list.removeContact(randomDhtAddress())
        list.addContact(item3)
        list.removeContact(item3.getNodeId())
        list.addContact(item4)
        list.addContact(item3)
        list.addContact(item2)
        list.addContact(item1)
        list.removeContact(item2.getNodeId())
        expect(list.getSize()).toEqual(3)
        expect(list.getContact(item2.getNodeId())).toBeFalsy()
        expect(list.getContactIds()).toEqual(list.getContactIds().sort(list.compareIds))
        expect(list.getClosestContacts()).toEqual([item1, item3, item4])
        const ret = list.removeContact(toDhtAddress(Buffer.from([0, 0, 0, 6])))
        expect(ret).toEqual(false)
        list.removeContact(item3.getNodeId())
        list.removeContact(randomDhtAddress())
        expect(list.getClosestContacts()).toEqual([item1, item4])
        expect(onContactRemoved).toHaveBeenNthCalledWith(1, item3)
        expect(onContactRemoved).toHaveBeenNthCalledWith(2, item2)
        expect(onContactRemoved).toHaveBeenNthCalledWith(3, item3)
    })

    it('get closest contacts', () => {
        const list = new SortedContactList({
            referenceId: item0.getNodeId(),
            maxSize: 8,
            allowToContainReferenceId: false
        })
        list.addContact(item1)
        list.addContact(item3)
        list.addContact(item4)
        list.addContact(item2)
        expect(list.getClosestContacts(2)).toEqual([item1, item2])
        expect(list.getClosestContacts(10)).toEqual([item1, item2, item3, item4])
        expect(list.getClosestContacts()).toEqual([item1, item2, item3, item4])
        expect(list.getClosestContacts(-2)).toEqual([])
    })

    it('get furthest contacts', () => {
        const list = new SortedContactList({
            referenceId: item0.getNodeId(),
            maxSize: 8,
            allowToContainReferenceId: false
        })
        list.addContact(item1)
        list.addContact(item3)
        list.addContact(item4)
        list.addContact(item2)
        expect(list.getFurthestContacts(2)).toEqual([item4, item3])
        expect(list.getFurthestContacts(10)).toEqual([item4, item3, item2, item1])
        expect(list.getFurthestContacts()).toEqual([item4, item3, item2, item1])
        expect(list.getFurthestContacts(-2)).toEqual([])
    })

    it('does not emit contactAdded if contact did not fit the structure', () => {
        const list = new SortedContactList({
            referenceId: item0.getNodeId(),
            maxSize: 2,
            allowToContainReferenceId: false
        })
        const onContactAdded = jest.fn()
        list.on('contactAdded', onContactAdded)
        list.addContact(item1)
        list.addContact(item2)
        expect(onContactAdded).toHaveBeenCalledTimes(2)
        list.addContact(item3)
        expect(onContactAdded).toHaveBeenCalledTimes(2)
        expect(list.getClosestContacts().length).toEqual(2)
    })
})
