#!/usr/bin/env node
import { show } from '../src/show'
import { getStreamId } from './common'
import { createClient } from '../src/client'
import { createCommand } from '../src/command'

createCommand()
    .arguments('<streamId>')
    .description('show detailed information about a stream')
    .option('--include-permissions', 'include list of permissions (requires SHARE permission)')
    .action((streamIdOrPath: string, options: any) => {
        const streamId = getStreamId(streamIdOrPath, options)!
        const client = createClient(options)
        show(streamId, options.includePermissions, client)
    })
    .parse()