import { Argument } from 'commander'
import { Stream, StreamPermission, StreamrClient } from 'streamr-client'
import { createClientCommand } from './command'

const PUBLIC_USER_ID = 'public'

const getTarget = (user: string): string|undefined => {
    if (user === PUBLIC_USER_ID) {
        return undefined
    } else {
        return user
    }
}

export const PERMISSIONS = new Map<string,StreamPermission>([
    ['subscribe', StreamPermission.SUBSCRIBE],
    ['publish', StreamPermission.PUBLISH],
    ['edit', StreamPermission.EDIT],
    ['delete', StreamPermission.DELETE],
    ['grant', StreamPermission.GRANT]
])

export const runModifyPermissionsCommand = (
    modifyUserPermission: (stream: Stream, permission: StreamPermission, target: string) => Promise<void>,
    modifyPublicPermission: (stream: Stream, permission: StreamPermission) => Promise<void>,
    modification: string,
): void => {
    createClientCommand(async (client: StreamrClient, streamId: string, user: string, permissionIds: string[]) => {
        const target = getTarget(user)
        const stream = await client.getStream(streamId)
        for await (const permissionId of permissionIds) {
            const permission = PERMISSIONS.get(permissionId)!
            if (target !== undefined) {
                await modifyUserPermission(stream, permission, target) 
            } else {
                await modifyPublicPermission(stream, permission)
            }
        }
    })
        .addArgument(new Argument('<streamId>'))
        .addArgument(new Argument('<user>'))
        .addArgument(new Argument('<permissions...>').choices(Array.from(PERMISSIONS.keys())))
        .description(`${modification} permission: use keyword "public" as a user to ${modification} a public permission`)
        .parseAsync(process.argv)
}