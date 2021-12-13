#!/usr/bin/env node
import EasyTable from 'easy-table'
import { createClient } from '../src/client'
import { createCommand } from '../src/command'

createCommand()
    .arguments('<storageNodeAddress>')
    .description('list streams parts in a storage node')
    .action((storageNodeAddress: string, options: any) => {
        const client = createClient(options)
        client.getStreamPartsByStorageNode(storageNodeAddress)
            .then((streamParts) => {
                if (streamParts.length > 0) {
                    console.info(EasyTable.print(streamParts.map(({ streamId, streamPartition }) => ({
                        streamId,
                        streamPartition,
                    }))))
                }
                return true
            }).catch((err) => {
                console.error(err)
                process.exit(1)
            })
    })
    .parse()
