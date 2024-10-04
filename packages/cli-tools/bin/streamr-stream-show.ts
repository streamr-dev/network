#!/usr/bin/env node
import { StreamrClient, UserPermissionAssignment } from '@streamr/sdk'
import { Options as BaseOptions, createClientCommand } from '../src/command'
import '../src/logLevel'
import { getPermissionId } from '../src/permission'
import { toUserId } from '@streamr/utils'

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
                user: ((assignment as UserPermissionAssignment).user !== undefined) 
                    ? toUserId((assignment as UserPermissionAssignment).user)
                    : undefined,
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
