import pino from 'pino'
import path from 'path'
import _ from 'lodash'

import { LoggerCommon } from './LoggerCommon'

export class LoggerBrowser extends LoggerCommon {
    static NAME_LENGTH = 20

    constructor(module: NodeJS.Module, context?: string, destinationStream?: { write(msg: string): void }) {
        const options: pino.LoggerOptions = {
            name: LoggerBrowser.createName(module, context),
            enabled: !process.env.NOLOG,
            level: process.env.LOG_LEVEL || 'info',
            // explicitly pass prettifier, otherwise pino may try to lazy require it,
            // which can fail when under jest+typescript, due to some CJS/ESM
            // incompatibility leading to throwing an error like:
            // "prettyFactory is not a function"
            prettifier: undefined,
            prettyPrint: false,
        }
        super(options, destinationStream)
    }

    private static createName(module: NodeJS.Module, context?: string) {
        const parsedPath = path.parse(module.id)
        let fileId = parsedPath.name
        if (fileId === 'index') {
            // file with name "foobar/index.ts" -> "foobar"
            const parts = parsedPath.dir.split(path.sep)
            fileId = parts[parts.length - 1]
        }
        const appId = process.env.STREAMR_APPLICATION_ID
        const longName = _.without([appId, fileId, context], undefined).join(':')
        return _.padEnd(longName.substring(0, LoggerBrowser.NAME_LENGTH), LoggerBrowser.NAME_LENGTH, ' ')
    }
}

export { LoggerBrowser as Logger }
