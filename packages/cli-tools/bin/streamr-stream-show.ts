#!/usr/bin/env node
import '../src/logLevel'
import _ from 'lodash'
import StreamrClient, { StreamPermission } from 'streamr-client'
import { createClientCommand } from '../src/command'
import { getPermissionId } from '../src/permission'

createClientCommand(async (client: StreamrClient, streamId: string, options: any) => {
    const stream = await client.getStream(streamId)
    const obj: any = stream.toObject()
    if (options.includePermissions) {
        const permissions = await stream.getPermissions()
        obj.permissions = _.mapValues(permissions, (p: StreamPermission[]) => p.map(getPermissionId))
    }
    console.info(JSON.stringify(obj, null, 2))
})
    .arguments('<streamId>')
    .description('show detailed information about a stream')
    .option('--include-permissions', 'include list of permissions')
    .parseAsync()