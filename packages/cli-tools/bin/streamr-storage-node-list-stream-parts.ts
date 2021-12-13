#!/usr/bin/env node
import EasyTable from 'easy-table'
import { createClient } from '../src/client'
import { createCommand } from '../src/command'

createCommand()
    .arguments('<storageNodeAddress>')
    .description('list streams parts in a storage node')
    .action(async (storageNodeAddress: string, options: any) => {
        const client = createClient(options)
        const streamParts = await client.getStreamPartsByStorageNode(storageNodeAddress)
        if (streamParts.length > 0) {
            console.info(EasyTable.print(streamParts.map(({ streamId, streamPartition }) => ({
                streamId,
                streamPartition,
            }))))
        }
    })
    .parseAsync()
