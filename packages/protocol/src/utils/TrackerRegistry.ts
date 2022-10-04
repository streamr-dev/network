import { StreamPartID } from "./StreamPartID"
import { keyToArrayIndex } from '@streamr/utils'

export interface SmartContractRecord {
    id: string
    http: string
    ws: string
}

export type TrackerInfo = SmartContractRecord | string

export class TrackerRegistry<T extends TrackerInfo> {
    private readonly records: T[]

    constructor(records: T[]) {
        this.records = records.slice() // copy before mutating
    }

    getTracker(streamPartId: StreamPartID): T {
        const index = keyToArrayIndex(this.records.length, streamPartId)
        return this.records[index]
    }

    getAllTrackers(): T[] {
        return this.records
    }
}

export function createTrackerRegistry<T extends TrackerInfo>(servers: T[]): TrackerRegistry<T> {
    return new TrackerRegistry(servers)
}
