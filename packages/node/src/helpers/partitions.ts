import { ParsedQs } from 'qs'
import { parsePositiveInteger, parseQueryParameter } from './parser'

export class PublishPartitionDefinition {
    partition?: number
    partitionKey?: string
    partitionKeyField?: string
}

export const parsePublishPartitionDefinition = (queryParams: ParsedQs): PublishPartitionDefinition => {
    const partition = parseQueryParameter<number>('partition', queryParams, parsePositiveInteger)
    const partitionKey = queryParams.partitionKey as string | undefined
    const partitionKeyField = queryParams.partitionKeyField as string | undefined
    const partitionDefinitions = [partition, partitionKey, partitionKeyField].filter((d) => d !== undefined)
    if (partitionDefinitions.length > 1) {
        throw new Error('Invalid combination of "partition", "partitionKey" and "partitionKeyField"')
    }
    return {
        partition,
        partitionKey,
        partitionKeyField
    }
}

export const getPartitionKey = (
    content: Record<string, unknown>,
    definition: PublishPartitionDefinition
): string | undefined => {
    return (
        definition.partitionKey ??
        (definition.partitionKeyField ? (content[definition.partitionKeyField] as string) : undefined)
    )
}
