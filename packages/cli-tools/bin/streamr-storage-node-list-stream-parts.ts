#!/usr/bin/env node
import EasyTable from 'easy-table'
import StreamrClient from 'streamr-client'
import { createClientCommand } from '../src/command'

createClientCommand((async (client: StreamrClient, storageNodeAddress: string) => {
    const streamParts = await client.getStreamPartsByStorageNode(storageNodeAddress)
    if (streamParts.length > 0) {
        console.info(EasyTable.print(streamParts.map(({ streamId, streamPartition }) => ({
            streamId,
            streamPartition,
        }))))
    }
}))
    .arguments('<storageNodeAddress>')
    .description('list streams parts in a storage node')
    .parseAsync()
