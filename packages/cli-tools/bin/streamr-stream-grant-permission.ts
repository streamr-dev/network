#!/usr/bin/env node
import {
    getStreamId
} from './common'
import { AnonymousStreamPermisson, StreamOperation, UserStreamPermission } from 'streamr-client'
import EasyTable from 'easy-table'
import { createClient } from '../src/client'
import { createCommand } from '../src/command'

const PUBLIC_PERMISSION_ID = 'public'
const OPERATION_PREFIX = 'stream_'

const getOperation = (id: string) => {
    // we support both short ids (e.g. "publish"), and long ids (e.g. "stream_publish")
    // the actual StreamOperation constant is the long id string
    // backend does the validation of invalid constants
    if (!id.startsWith(OPERATION_PREFIX)) {
        return (OPERATION_PREFIX + id) as StreamOperation
    } else {
        return id as StreamOperation
    }
}

const getShortOperationId = (operation: StreamOperation) => {
    const longOperationId = operation as string
    if (longOperationId.startsWith(OPERATION_PREFIX)) {
        return longOperationId.substring(OPERATION_PREFIX.length)
    } else {
        throw new Error(`Assertion failed: unknown prefix for in ${longOperationId}`)
    }
}

const getTarget = (user: string): string|undefined => {
    if (user === PUBLIC_PERMISSION_ID) {
        return undefined
    } else {
        return user
    }
}

createCommand()
    .arguments('<streamId> <user> <operations...>')
    .description('grant permission: use keyword "public" as a user to grant a public permission')
    .action(async (streamIdOrPath: string, user: string, operationIds: string[], options: any) => {
        const operations = operationIds.map((o: string) => getOperation(o))
        const target = getTarget(user)
        const client = createClient(options)
        const streamId = getStreamId(streamIdOrPath, options)!
        const stream = await client.getStream(streamId)
        const tasks = operations.map((operation: StreamOperation) => stream.grantPermission(operation, target))
        const permissions = await Promise.all(tasks)
        console.info(EasyTable.print(permissions.map((permission: UserStreamPermission|AnonymousStreamPermisson) => ({
            id: permission.id,
            operation: getShortOperationId(permission.operation),
            user: (permission as AnonymousStreamPermisson).anonymous ? PUBLIC_PERMISSION_ID : (permission as UserStreamPermission).user
        }))))
    })
    .parseAsync()