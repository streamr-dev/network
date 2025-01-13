#!/usr/bin/env node
import '../src/logLevel'

import { StreamrClient } from '@streamr/sdk'
import { createClientCommand, Options as BaseOptions } from '../src/command'
import { getPermissionId } from '../src/permission'
import { omit } from 'lodash'

interface Options extends BaseOptions {
    includePermissions: boolean
}

const withRenamedField = (obj: any, from: string, to: string) => {
    return {
        ...omit(obj, from),
        [to]: obj[from]
    }
}

createClientCommand(async (client: StreamrClient, streamId: string, options: Options) => {
    const stream = await client.getStream(streamId)
    const obj: any = { id: stream.id, ...(await stream.getMetadata()) }
    if (options.includePermissions) {
        const assigments = await stream.getPermissions()
        obj.permissions = assigments.map((assignment) => {
            return {
                ...withRenamedField(assignment, 'userId', 'user'),
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
