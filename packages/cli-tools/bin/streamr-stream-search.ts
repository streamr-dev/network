#!/usr/bin/env node
import '../src/logLevel'

import { StreamrClient, SearchStreamsPermissionFilter, StreamPermission } from '@streamr/sdk'
import { createClientCommand, Options as BaseOptions } from '../src/command'
import { Option } from 'commander'
import { getPermission, PERMISSIONS } from '../src/permission'
import { getOptionType, OptionType } from '../src/common'

interface Options extends BaseOptions {
    user?: string | true
    public: boolean
    all?: StreamPermission[]
    any?: StreamPermission[]
}

const createPermissionFilter = async (
    user: string | true | undefined,
    allowPublic: boolean | undefined,
    allOf: StreamPermission[] | undefined,
    anyOf: StreamPermission[] | undefined,
    client: StreamrClient
): Promise<SearchStreamsPermissionFilter | undefined> => {
    if (user !== undefined) {
        return {
            userId: getOptionType(user) === OptionType.ARGUMENT ? (user as string) : await client.getUserId(),
            allowPublic: allowPublic ?? false,
            allOf,
            anyOf
        }
    } else if (allowPublic !== undefined || allOf !== undefined || anyOf !== undefined) {
        console.error('specify a user with "--user" when using "--public", "--all" or "--any"')
        process.exit(1)
    }
}

const createPermissionListOption = (id: string) => {
    return new Option(`--${id} <permissions>`, 'comma-separated list of permissions')
        .choices(Array.from(PERMISSIONS.keys()))
        .argParser((value: string) => value.split(',').map((id) => getPermission(id)))
}

createClientCommand(async (client: StreamrClient, term: string | undefined, options: Options) => {
    const permissionFilter = await createPermissionFilter(
        options.user,
        options.public,
        options.all,
        options.any,
        client
    )
    const streams = client.searchStreams(term, permissionFilter)
    for await (const stream of streams) {
        console.info(stream.id)
    }
})
    .arguments('[term]')
    .description('search streams')
    .option('--user [user]', 'a stream must have permissions for the given user, defaults to the authenticated user')
    .option('--public', 'the permission can be implicit (a public permission to the stream)')
    .addOption(createPermissionListOption('all'))
    .addOption(createPermissionListOption('any'))
    .parseAsync()
