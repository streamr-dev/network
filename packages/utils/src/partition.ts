export const MAX_PARTITION_COUNT = 100

export function ensureValidStreamPartitionIndex(streamPartition: number | undefined): void | never {
    if (!Number.isSafeInteger(streamPartition) || streamPartition! < 0 || streamPartition! >= MAX_PARTITION_COUNT) {
        throw new Error(`invalid streamPartition value: ${streamPartition}`)
    }
}

export function ensureValidStreamPartitionCount(streamPartition: number | undefined): void | never {
    if (!Number.isSafeInteger(streamPartition) || streamPartition! < 0 || streamPartition! > MAX_PARTITION_COUNT) {
        throw new Error(`invalid streamPartition value: ${streamPartition}`)
    }
}
