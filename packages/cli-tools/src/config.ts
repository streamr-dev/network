import path from 'path'
import os from 'os'
import { readFileSync } from 'fs'
import { StreamrClientConfig } from '@streamr/sdk'

interface Config {
    client: StreamrClientConfig
}

/*
 * Validate that the config contains at least one root level element: the "client" block.
 * The values of the "client" blocks are validated by StreamrClient when the configuration
 * is used.
 *
 * We don't check other root level elements. It is ok to use a Broker config file as
 * a cli-tools config file. In that case the file contains e.g. "plugins" block,
 * but cli-tools can just ignore that block.
 */
const validateConfig = (config: any, fileName: string): void | never => {
    const CLIENT_CONFIG_BLOCK = 'client'
    if (config[CLIENT_CONFIG_BLOCK] === undefined) {
        throw new Error(`Missing root element "${CLIENT_CONFIG_BLOCK}" in ${fileName}`)
    }
}

const tryReadConfigFile = (fileName: string): Config | undefined | never => {
    let content
    try {
        content = readFileSync(fileName, 'utf8')
    } catch {
        return undefined
    }
    const json = JSON.parse(content)
    validateConfig(json, fileName)
    return json
}

export const getConfig = (id?: string): Config | undefined => {
    const CONFIG_DIRECTORY = path.join(os.homedir(), '.streamr', 'config')
    if (id !== undefined) {
        const fileNames = [id, path.join(CONFIG_DIRECTORY, `${id}.json`)]
        for (const fileName of fileNames) {
            const content = tryReadConfigFile(fileName)
            if (content !== undefined) {
                return content
            }
        }
        throw new Error('Config file not found')
    } else {
        const fileName = path.join(CONFIG_DIRECTORY, `default.json`)
        return tryReadConfigFile(fileName)
    }
}
