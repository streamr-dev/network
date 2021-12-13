#!/usr/bin/env node
import {
    getStreamId
} from './common'
import StreamrClient from 'streamr-client'
import { createClientCommand } from '../src/command'

createClientCommand(async (client: StreamrClient, streamIdOrPath: string, permissionId: number, options: any) => {
    const streamId = getStreamId(streamIdOrPath, options)!
    const stream = await client.getStream(streamId)
    stream.revokePermission(permissionId)
})
    .arguments('<streamId> <permissionId>')
    .description('revoke permission')
    .parseAsync()