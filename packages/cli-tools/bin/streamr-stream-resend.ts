#!/usr/bin/env node
import { createCommand } from '../src/command'

createCommand()
    .usage('<command> [<args>]')
    .description('request resend of stream and print JSON messages to stdout line-by-line')
    .command('from', 'request messages starting from given date-time')
    .command('last', 'request last N messages')
    .command('range', 'request messages between two given date-times')
    .parse()