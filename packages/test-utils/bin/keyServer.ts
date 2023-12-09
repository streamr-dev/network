#!/usr/bin/env node

import { KeyServer } from '../src/index'

(async () => {
    KeyServer.startIfNotRunning(parseInt(process.argv[2]), parseInt(process.argv[3]), parseInt(process.argv[4]))
        .then(() => {}).catch((err) => {
            console.error(err)
            process.exit(1)
        })
})()