#!/usr/bin/env node -r ts-node/register
import { Command } from 'commander';
import { StreamrClient, Stream } from 'streamr-client'
import {
    envOptions,
    authOptions,
    exitWithHelpIfArgsNotBetween,
    formStreamrOptionsWithEnv,
} from './common'
import pkg from '../package.json'

const program = new Command();
program
    .arguments('<storageNodeAddress> <streamId>')
    .description('remove stream from a storage node')
authOptions(program)
envOptions(program)
    .version(pkg.version)
    .action((storageNodeAddress: string, streamId: string, options: any) => {
        const client = new StreamrClient(formStreamrOptionsWithEnv(options))
        client.getStream(streamId)
            .then((stream: Stream) => stream.removeFromStorageNode(storageNodeAddress))
    })
    .parse(process.argv)

exitWithHelpIfArgsNotBetween(program, 2, 2)
