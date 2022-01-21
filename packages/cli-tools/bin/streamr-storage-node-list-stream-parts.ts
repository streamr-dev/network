#!/usr/bin/env node
import '../src/logLevel'
import EasyTable from 'easy-table'
import StreamrClient from 'streamr-client'
import { createClientCommand } from '../src/command'
import { StreamPartIDUtils } from 'streamr-client-protocol'

createClientCommand((async (client: StreamrClient, storageNodeAddress: string) => {
    const streamParts = await client.getStreamPartsByStorageNode(storageNodeAddress)
    if (streamParts.length > 0) {
        console.info(EasyTable.print(streamParts.map((streamPartId) => {
            const [streamId, streamPartition] = StreamPartIDUtils.getStreamIDAndPartition(streamPartId)
            return {
                streamId,
                streamPartition
            }
        })))
    }
}))
    .arguments('<storageNodeAddress>')
    .description('list stream parts in a storage node')
    .parseAsync()
