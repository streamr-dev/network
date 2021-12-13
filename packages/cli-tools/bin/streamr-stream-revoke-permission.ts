#!/usr/bin/env node
import {
    getStreamId
} from './common'
import { createClient } from '../src/client'
import { createCommand } from '../src/command'

createCommand()
    .arguments('<streamId> <permissionId>')
    .description('revoke permission')
    .action(async (streamIdOrPath: string, permissionId: number, options: any) => {
        const client = createClient(options)
        const streamId = getStreamId(streamIdOrPath, options)!
        const stream = await client.getStream(streamId)
        stream.revokePermission(permissionId)
    })
    .parseAsync()