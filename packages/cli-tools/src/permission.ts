import { Command } from 'commander'
import {
    envOptions,
    authOptions,
    formStreamrOptionsWithEnv,
    getStreamId
} from '../bin/common'
import pkg from '../package.json'
import { Stream, StreamPermission, StreamrClient } from 'streamr-client'

const PUBLIC_PERMISSION_ID = 'public'

const getTarget = (user: string): string|undefined => {
    if (user === PUBLIC_PERMISSION_ID) {
        return undefined
    } else {
        return user
    }
}

export const runModifyPermissionsCommand = (
    modifyUserPermission: (stream: Stream, permission: StreamPermission, target: string) => Promise<void>,
    modifyPublicPermission: (stream: Stream, permission: StreamPermission) => Promise<void>,
    modification: string,
): void => {
    const program = new Command()
    program
        .arguments('<streamId> <user> <permissions...>')
        .description(`${modification} permission: use keyword "public" as a user to ${modification} a public permission`)
    authOptions(program)
    envOptions(program)
        .version(pkg.version)
        .action(async (streamIdOrPath: string, user: string, permissionIds: string[], options: any) => {
            const target = getTarget(user)
            const client = new StreamrClient(formStreamrOptionsWithEnv(options))
            const streamId = getStreamId(streamIdOrPath, options)!
            const stream = await client.getStream(streamId)
            for await (const permissionId of permissionIds) {
                const permission = permissionId as StreamPermission
                if (target !== undefined) {
                    await modifyUserPermission(stream, permission, target) 
                } else {
                    await modifyPublicPermission(stream, permission)
                }
            }
        })
        .parseAsync(process.argv)
        .catch((e) => {
            console.error(e)
            process.exit(1)
        })
}