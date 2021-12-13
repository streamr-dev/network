#!/usr/bin/env node
import { Option } from 'commander'
import EasyTable from 'easy-table'
import StreamrClient from 'streamr-client'
import { createClientCommand } from '../src/command'

createClientCommand(async (client: StreamrClient, options: any) => {
    const query: any = {
        operation: options.operation,
        noConfig: true,
        publicAccess: options.publicAccess,
        search: options.search,
        grantedAccess: options.grantedAccess
    }    
    const streams = await client.listStreams(query)
    if (streams.length > 0) {
        // @ts-expect-error: TODO: lastUpdated not officially part of stream object?
        console.info(EasyTable.print(streams.map(({id, name, lastUpdated}) => ({
            lastUpdated,
            id,
            name
        }))))
    }
})
    .description('fetch a list of streams that are accessible by the authenticated user')
    .option('-s, --search [term]', 'search for term in name or description')
    // TODO could support shorter forms of operations: e.g. "publish" instead of "stream_publish",
    // see streamr-stream-grant-permission.ts
    .addOption(new Option('-o, --operation [permission]', 'filter by permission')
        .choices(['stream_get','stream_subscribe','stream_publish','stream_delete','stream_share'])
        .default('stream_get'))
    .option('--public-access', 'include publicly available streams')
    .option('--no-granted-access', 'exclude streams that user has directly granted permissions to')
    .parseAsync()