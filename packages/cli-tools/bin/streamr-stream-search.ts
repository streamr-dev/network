#!/usr/bin/env node
import '../src/logLevel'
import StreamrClient from 'streamr-client'
import { createClientCommand } from '../src/command'

createClientCommand(async (client: StreamrClient, term: string) => {
    const streams = client.searchStreams(term)
    for await (const stream of streams) {
        console.log(stream.id)
    }
})
    .arguments('<term>')
    .description('search streams')
    .parseAsync()