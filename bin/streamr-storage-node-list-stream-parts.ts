#!/usr/bin/env node -r ts-node/register
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

const program = new Command();
program
    .arguments('<storageNodeAddress>')
    .description('list streams parts in a storage node')
authOptions(program)
envOptions(program)
    .version(pkg.version)
    .action((storageNodeAddress: string, options: any) => {
        const client = new StreamrClient(formStreamrOptionsWithEnv(options))
        client.getStreamPartsByStorageNode(storageNodeAddress)
            .then((streamParts: StreamPart[]) => {
                if (streamParts.length > 0) {
                    console.info(EasyTable.print(streamParts.map((streamPart: StreamPart) => ({
                        streamId: streamPart.getStreamId(),
                        streamPartition: streamPart.getStreamPartition()
                    }))))
                }
            })
    })
    .parse(process.argv)

exitWithHelpIfArgsNotBetween(program, 1, 1)
