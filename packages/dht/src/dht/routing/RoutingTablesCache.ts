import { DhtAddress } from '../../identifiers'
import { SortedContactList } from '../contact/SortedContactList'
import { RoutingRemoteContact } from './RoutingSession'
import { LRUCache } from 'lru-cache'

type RoutingTableID = string
export type RoutingTable = Pick<
    SortedContactList<RoutingRemoteContact>,
    'getClosestContacts' | 'addContacts' | 'addContact' | 'removeContact' | 'stop'
>

const createRoutingTableId = (targetId: DhtAddress, previousId?: DhtAddress): RoutingTableID => {
    return targetId + (previousId ? previousId : '')
}

const DEFAULT_LRU_OPTIONS = {
    max: 1000,
    maxAge: 15 * 1000
}

/**
 * RoutingTablesCache is a cache for routing tables.
 * It is used to store the routing tables for a specific targetId and previousId.
 * Storing the previousId is important as it is used as a minimum distance for the contacts in the table.
 * Calculating a RoutingTable from scratch is an O(n log n) operation (n = number of connections of a node)
 * However,
 * - Adding a contact to a RoutingTable is an O(log n) operation.
 * - Deleting a contact from a RoutingTable is an O(1) operation.
 * Thus, holding the most frequently used routing tables in memory to be updated on
 * connections and disconnections is hugely beneficial in terms of performance.
 */

export class RoutingTablesCache {
    private readonly tables: LRUCache<RoutingTableID, RoutingTable> = new LRUCache(DEFAULT_LRU_OPTIONS)

    get(targetId: DhtAddress, previousId?: DhtAddress): RoutingTable | undefined {
        return this.tables.get(createRoutingTableId(targetId, previousId))
    }

    set(targetId: DhtAddress, table: RoutingTable, previousId?: DhtAddress): void {
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
