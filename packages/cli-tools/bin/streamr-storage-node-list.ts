#!/usr/bin/env node
import { Command } from 'commander';
import { StreamrClient, StreamPart } from 'streamr-client'
import {
    envOptions,
    authOptions,
    exitWithHelpIfArgsNotBetween,
    formStreamrOptionsWithEnv,
} from './common'
import pkg from '../package.json'
import EasyTable from 'easy-table'

const getStorageNodes = async (streamId: string|undefined, client: StreamrClient) => {
    if (streamId !== undefined) {
        return client.getStream(streamId)
            .then(stream => stream.getStorageNodes())
            .then(storegeNodes => {
                return storegeNodes.map(storageNode => storageNode.getAddress())
            })
    } else {
        // all storage nodes (currently there is only one)
        return [client.options.storageNode.address]
    }
}

const program = new Command();
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
        })
    })
    .parse(process.argv)

exitWithHelpIfArgsNotBetween(program, 0, 0)
