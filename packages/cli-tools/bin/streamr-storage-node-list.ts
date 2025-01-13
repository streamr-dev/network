#!/usr/bin/env node
import '../src/logLevel'

import { StreamrClient } from '@streamr/sdk'
import EasyTable from 'easy-table'
import { createClientCommand, Options as BaseOptions } from '../src/command'

interface Options extends BaseOptions {
    stream?: string
}

createClientCommand(async (client: StreamrClient, options: Options) => {
    const streamId = options.stream
    const addresses = await client.getStorageNodes(streamId)
    if (addresses.length > 0) {
        console.info(
            EasyTable.print(
                addresses.map((address: string) => ({
                    address
                }))
            )
        )
    }
})
    .description('fetch a list of storage nodes')
    .option('-s, --stream <streamId>', 'only storage nodes which store the given stream (needs authentication)')
    .parseAsync()
