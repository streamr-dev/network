import { Argument } from 'commander'
import { PermissionAssignment, Stream, StreamPermission, StreamrClient } from '@streamr/sdk'
import { createClientCommand } from './command'

const PUBLIC_USER_ID = 'public'

export const PERMISSIONS = new Map<string, StreamPermission>([
    ['subscribe', StreamPermission.SUBSCRIBE],
    ['publish', StreamPermission.PUBLISH],
    ['edit', StreamPermission.EDIT],
    ['delete', StreamPermission.DELETE],
    ['grant', StreamPermission.GRANT]
])

export const getPermission = (id: string): StreamPermission | never => {
    const result = PERMISSIONS.get(id)
    if (result === undefined) {
        throw new Error(`unknown permission: ${id}`)
    }
    return result
}

export const getPermissionId = (permission: StreamPermission): string => {
    return Array.from(PERMISSIONS.entries()).find(([_id, p]) => p === permission)![0]
}

export const runModifyPermissionsCommand = (
    modify: (stream: Stream, assignment: PermissionAssignment) => Promise<void>,
    modification: string
): void => {
    createClientCommand(async (client: StreamrClient, streamId: string, user: string, permissionIds: string[]) => {
        const stream = await client.getStream(streamId)
        const permissions: StreamPermission[] = permissionIds.map((permissionId) => getPermission(permissionId))
        let assignment: PermissionAssignment
        if (user === PUBLIC_USER_ID) {
            assignment = {
                permissions,
                public: true
            }
        } else {
            assignment = {
                permissions,
                userId: user
            }
        }
        await modify(stream, assignment)
    })
        .addArgument(new Argument('<streamId>'))
        .addArgument(new Argument('<user>'))
        .addArgument(new Argument('<permissions...>').choices(Array.from(PERMISSIONS.keys())))
        .description(
            `${modification} permission: use keyword "public" as a user to ${modification} a public permission`
        )
        .parseAsync(process.argv)
}
