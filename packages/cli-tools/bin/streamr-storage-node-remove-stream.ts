#!/usr/bin/env node
import { Stream } from 'streamr-client'
import {
    getStreamId,
} from './common'
import { createClient } from '../src/client'
import { createCommand } from '../src/command'

createCommand()
    .arguments('<storageNodeAddress> <streamId>')
    .description('remove stream from a storage node')
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
    .parse()
