#!/usr/bin/env node
import { Command } from 'commander'
import { StreamrClient } from 'streamr-client'
import {
    envOptions,
    authOptions,
    exitWithHelpIfArgsNotBetween,
    formStreamrOptionsWithEnv,
} from './common'
import pkg from '../package.json'
import EasyTable from 'easy-table'

const getStorageNodes = async (streamId: string | undefined, client: StreamrClient): Promise<string[]> => {
    if (streamId !== undefined) {
        const stream = await client.getStream(streamId)
        const storageNodes = await stream.getStorageNodes()
        return storageNodes.map((storageNode) => storageNode.getAddress())
    } else {
        // all storage nodes (currently there is only one)
        // @ts-expect-error digging a private field
        return [client.options.storageNode.address]
    }
}

const program = new Command()
program
    .description('fetch a list of storage nodes')
    .option('-s, --stream <streamId>', 'only storage nodes which store the given stream (needs authentication)')
authOptions(program)
envOptions(program)
    .version(pkg.version)
    .action((options: any) => {
        const client = new StreamrClient(formStreamrOptionsWithEnv(options))
        getStorageNodes(options.stream, client).then((addresses: string[]) => {
            if (addresses.length > 0) {
                console.info(EasyTable.print(addresses.map((address: string) => ({
                    address
                }))))    
            }
            return true
        }).catch((err) => {
            console.error(err)
            process.exit(1)
        })
    })
    .parse(process.argv)

exitWithHelpIfArgsNotBetween(program, 0, 0)
