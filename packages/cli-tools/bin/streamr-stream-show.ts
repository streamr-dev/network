#!/usr/bin/env node
import { createClientCommand } from '../src/command'
import StreamrClient from 'streamr-client'

createClientCommand(async (client: StreamrClient, streamId: string, options: any) => {
    const stream = await client.getStream(streamId)
    const obj = stream.toObject()
    if (options.includePermissions) {
        // @ts-expect-error permissions not on {}
        obj.permissions = await stream.getPermissions()
    }
    console.info(JSON.stringify(obj, null, 2))
})
    .arguments('<streamId>')
    .description('show detailed information about a stream')
    .option('--include-permissions', 'include list of permissions (requires SHARE permission)')
    .parseAsync()