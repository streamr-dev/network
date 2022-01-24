#!/usr/bin/env node
import '../src/logLevel'
import EasyTable from 'easy-table'
import StreamrClient from 'streamr-client'
import { createClientCommand } from '../src/command'

createClientCommand(async (client: StreamrClient, term: string) => {
    const streams = await client.searchStreams(term)
    if (streams.length > 0) {
        console.info(EasyTable.print(streams.map(({id}) => ({
            id
        }))))
    }
})
    .arguments('<term>')
    .description('search streams')
    .parseAsync()