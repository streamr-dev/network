#!/usr/bin/env node
import '../src/logLevel'
import { StreamrClient, UserPermissionAssignment } from '@streamr/sdk'
import { createClientCommand, Options as BaseOptions } from '../src/command'
import { getPermissionId } from '../src/permission'
import { binaryToHex } from '@streamr/utils'

interface Options extends BaseOptions {
    includePermissions: boolean
}

createClientCommand(async (client: StreamrClient, streamId: string, options: Options) => {
    const stream = await client.getStream(streamId)
    const obj: any = { id: stream.id, ...stream.getMetadata() }
    if (options.includePermissions) {
        const assigments = await stream.getPermissions()
        obj.permissions = assigments.map((assignment) => {
            return {
                ...assignment,
                // eslint-disable-next-line max-len
                user: ((assignment as UserPermissionAssignment).user !== undefined) ? binaryToHex((assignment as UserPermissionAssignment).user, true) : undefined,
                permissions: assignment.permissions.map(getPermissionId)
            }
        })
    }
    console.info(JSON.stringify(obj, null, 2))
})
    .arguments('<streamId>')
    .description('show detailed information about a stream')
    .option('--include-permissions', 'include list of permissions', false)
    .parseAsync()
