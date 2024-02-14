import { DhtAddress } from '../../identifiers'
import { SortedContactList } from '../contact/SortedContactList'
import { RoutingRemoteContact } from './RoutingSession'

type RoutingTableID = string

const createRoutingTableId = (targetId: DhtAddress, previousId?: DhtAddress): RoutingTableID => {
    return targetId + (previousId ? previousId : '')
}

export class RoutingTableCache {

    private readonly tables: Map<RoutingTableID, SortedContactList<RoutingRemoteContact>> = new Map()

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
