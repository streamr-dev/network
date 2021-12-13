#!/usr/bin/env node
import { Command } from 'commander'
import { Stream } from 'streamr-client'
import {
    envOptions,
    authOptions,
    exitWithHelpIfArgsNotBetween,
    getStreamId,
} from './common'
import pkg from '../package.json'
import { createClient } from '../src/client'

const program = new Command()
program
    .arguments('<storageNodeAddress> <streamId>')
    .description('remove stream from a storage node')
authOptions(program)
envOptions(program)
    .version(pkg.version)
    .action((storageNodeAddress: string, streamIdOrPath: string, options: any) => {
        const client = createClient(options)
        const streamId = getStreamId(streamIdOrPath, options)!
        client.getStream(streamId)
            .then((stream: Stream) => stream.removeFromStorageNode(storageNodeAddress))
            .catch((err) => {
                console.error(err)
                process.exit(1)
            })
    })
    .parse(process.argv)

exitWithHelpIfArgsNotBetween(program, 2, 2)
