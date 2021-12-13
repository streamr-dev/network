#!/usr/bin/env node
import { getStreamId } from './common'
import { createClient } from '../src/client'
import { createCommand } from '../src/command'

createCommand()
    .arguments('<streamId>')
    .description('show detailed information about a stream')
    .option('--include-permissions', 'include list of permissions (requires SHARE permission)')
    .action(async (streamIdOrPath: string, options: any) => {
        const streamId = getStreamId(streamIdOrPath, options)!
        const client = createClient(options)
        const stream = await client.getStream(streamId)
        const obj = stream.toObject()
        if (options.includePermissions) {
            // @ts-expect-error permissions not on {}
            obj.permissions = await stream.getPermissions()
        }
        console.info(JSON.stringify(obj, null, 2))
    })
    .parseAsync()