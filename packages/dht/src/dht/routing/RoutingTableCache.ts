import { DhtAddress } from '../../identifiers'
import { SortedContactList } from '../contact/SortedContactList'
import { RoutingRemoteContact } from './RoutingSession'
import { LRUCache } from 'lru-cache'

type RoutingTableID = string

const createRoutingTableId = (targetId: DhtAddress, previousId?: DhtAddress): RoutingTableID => {
    return targetId + (previousId ? previousId : '')
}

const DEFAULT_LRU_OPTIONS = {
    max: 200,
    maxAge: 5 * 60 * 1000,

}
export class RoutingTableCache {

    private readonly tables: LRUCache<RoutingTableID, SortedContactList<RoutingRemoteContact>> = new LRUCache(DEFAULT_LRU_OPTIONS)

    get(targetId: DhtAddress, previousId?: DhtAddress): SortedContactList<RoutingRemoteContact> | undefined {
        return this.tables.get(createRoutingTableId(targetId, previousId))
    }

    set(targetId: DhtAddress, table: SortedContactList<RoutingRemoteContact>, previousId?: DhtAddress): void {
        this.tables.set(createRoutingTableId(targetId, previousId), table)
    }

    has(targetId: DhtAddress, previousId?: DhtAddress): boolean {
        return this.tables.has(createRoutingTableId(targetId, previousId))
    }

    onNodeDisconnected(nodeId: DhtAddress): void {
        this.tables.forEach((table) => table.removeContact(nodeId))
    }

    onNodeConnected(remote: RoutingRemoteContact): void {
        this.tables.forEach((table) => table.addContact(remote))
    }

    reset(): void {
        this.tables.forEach((table) => table.stop())
        this.tables.clear()
    }
}
