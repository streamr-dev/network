import { MessageType as MessageType$, ScalarType } from '@protobuf-ts/runtime'
import { randomString } from '@streamr/utils'
import crypto from 'crypto'
import { Timestamp } from '../../../src/proto/google/protobuf/timestamp'
import { Any } from '../../../src/proto/google/protobuf/any'
import { DataEntry } from '../../../src/proto/packages/dht/protos/DhtRpc'
import { createMockPeerDescriptor } from '../utils'

const MockData = new class extends MessageType$<{ foo: string }> {
    constructor() {
        super('MockData', [
            { no: 1, name: 'foo', kind: 'scalar', opt: false, T: ScalarType.STRING }
        ])
    }
}

export const createMockDataEntry = (entry: Partial<DataEntry> = {}): DataEntry => {
    return { 
        key: crypto.randomBytes(10),
        data: Any.pack({ foo: randomString(5) }, MockData),
        creator: entry.creator ?? createMockPeerDescriptor(),
        ttl: 10000,
        stale: false,
        deleted: false,
        createdAt: Timestamp.now(),
        ...entry
    }
}

export const unpackData = (entry: DataEntry): { foo: string } => {
    return Any.unpack(entry.data!, MockData)
}

export const expectEqualData = (entry1: DataEntry, entry2: DataEntry): void => {
    expect(unpackData(entry1).foo).toBe(unpackData(entry2).foo)
}
