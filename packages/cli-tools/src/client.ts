import path from 'path'
import os from 'os'
import { readFileSync } from 'fs'
import _ from 'lodash'
import { BrubeckClientConfig, StreamrClient, ConfigTest } from 'streamr-client'
import { GlobalCommandLineArgs } from '../bin/common'

const tryReadFile = (fileName: string): string|undefined => {
    try {
        return readFileSync(fileName, 'utf8')
    } catch (e: any) {
        return undefined
    }
}

const getConfigFileJson = (id?: string): any|undefined => {
    const CONFIG_DIRECTORY = path.join(os.homedir(), '.streamr', 'config')
    let fileNames: string[]
    if (id !== undefined) {
        fileNames = [
            id,
            `${id}.json`,
            path.join(CONFIG_DIRECTORY, `${id}.json`),
            
        ]
    } else {
        fileNames = [ path.join(CONFIG_DIRECTORY, `default.json`) ]
    }
    for (const fileName of fileNames) {
        const content = tryReadFile(fileName)
        if (content !== undefined) {
            return JSON.parse(content).client
        }
    }
    return undefined
}

const getConfig = (commandLineArgs: GlobalCommandLineArgs, overridenOptions: BrubeckClientConfig) => {
    const environmentOptions = (commandLineArgs.dev !== undefined) ? _.omit(ConfigTest, 'auth') : undefined
    const configFileJson = getConfigFileJson(commandLineArgs.config)
    const authenticationOptions = (commandLineArgs.privateKey !== undefined) ? { auth: { privateKey: commandLineArgs.privateKey } } : undefined
    return _.merge(
        environmentOptions,
        configFileJson,
        authenticationOptions,
        overridenOptions
    )
}

export const createClient = (commandLineArgs: GlobalCommandLineArgs, overridenOptions: BrubeckClientConfig = {}): StreamrClient => {
    const config = getConfig(commandLineArgs, overridenOptions)
    return new StreamrClient(config)
}