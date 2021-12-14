#!/usr/bin/env node
import StreamrClient from 'streamr-client'
import { createClientCommand } from '../src/command'

createClientCommand(async (client: StreamrClient, streamId: string, permissionId: number) => {
    const stream = await client.getStream(streamId)
    stream.revokePermission(permissionId)
})
    .arguments('<streamId> <permissionId>')
    .description('revoke permission')
    .parseAsync()