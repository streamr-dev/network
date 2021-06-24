#!/usr/bin/env node
import { Command } from 'commander'
import { StreamrClient, Stream } from 'streamr-client'
import {
    envOptions,
    authOptions,
    exitWithHelpIfArgsNotBetween,
    formStreamrOptionsWithEnv,
    createStreamId,
} from './common'
import pkg from '../package.json'

const program = new Command()
program
    .arguments('<storageNodeAddress> <streamId>')
    .description('remove stream from a storage node')
authOptions(program)
envOptions(program)
    .version(pkg.version)
    .action((storageNodeAddress: string, streamIdOrPath: string, options: any) => {
        const client = new StreamrClient(formStreamrOptionsWithEnv(options))
        const streamId = createStreamId(streamIdOrPath, options)!
        client.getStream(streamId)
            .then((stream: Stream) => stream.removeFromStorageNode(storageNodeAddress))
            .catch((err) => {
                console.error(err)
                process.exit(1)
            })
    })
    .parse(process.argv)

exitWithHelpIfArgsNotBetween(program, 2, 2)
