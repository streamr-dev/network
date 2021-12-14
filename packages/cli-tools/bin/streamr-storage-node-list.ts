#!/usr/bin/env node
import { StreamrClient } from 'streamr-client'
import EasyTable from 'easy-table'
import { createClientCommand } from '../src/command'

const getStorageNodes = async (streamId: string | undefined, client: StreamrClient): Promise<string[]> => {
    if (streamId !== undefined) {
        const stream = await client.getStream(streamId)
        const storageNodes = await stream.getStorageNodes()
        return storageNodes.map((storageNode) => storageNode.address)
    } else {
        // all storage nodes (currently there is only one)
        const nodes = await client.getNodes()
        return nodes.map((n) => n.address)
    }
}

createClientCommand(async (client: StreamrClient, options: any) => {
    const streamId = options.stream
    const addresses = await getStorageNodes(streamId, client)
    if (addresses.length > 0) {
        console.info(EasyTable.print(addresses.map((address: string) => ({
            address
        }))))
    }
})
    .description('fetch a list of storage nodes')
    .option('-s, --stream <streamId>', 'only storage nodes which store the given stream (needs authentication)')
    .parseAsync()
