#!/usr/bin/env node
require('../src/logLevel')
import { Option } from 'commander'
import EasyTable from 'easy-table'
import StreamrClient, { StreamListQuery } from 'streamr-client'
import { createClientCommand } from '../src/command'
import { PERMISSIONS } from '../src/permission'

createClientCommand(async (client: StreamrClient, options: any) => {
    const query: StreamListQuery = {
        permission: PERMISSIONS.get(options.permission),
        noConfig: true,
        publicAccess: options.publicAccess,
        search: options.search,
        grantedAccess: options.grantedAccess
    }    
    const streams = await client.listStreams(query)
    if (streams.length > 0) {
        console.info(EasyTable.print(streams.map(({id}) => ({
            id
        }))))
    }
})
    .description('fetch a list of streams that are accessible by the authenticated user')
    .option('-s, --search [term]', 'search for term in name or description')
    .addOption(new Option('-p, --permission <permission>', 'filter by permission')
        .choices(Array.from(PERMISSIONS.keys())))
    .option('--public-access', 'include publicly available streams')
    .option('--no-granted-access', 'exclude streams that user has directly granted permissions to')
    .parseAsync()