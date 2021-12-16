import path from 'path'
import os from 'os'
import { readFileSync } from 'fs'
import { BrubeckClientConfig } from 'streamr-client'

interface Config {
    client: BrubeckClientConfig
}

/*
 * Currently the config contains only one root level element: the "client" block.
 * Here we validate that there are no additional root level fields. The values 
 * of the "client" blocks are validated by StreamrClient when the configuration is
 * used.
 *  
 * If the config will be more complicated in the future, we could use e.g. AJV npm 
 * module to validate the file content.
 * 
 * Also we may want to extend the usage of configuration files so that the same file 
 * can be used to configure both Broker and cli-tools. In that case we should move
 * Broker's validation logic to a shared package and import that code here.
 */
const validateConfig = (config: any): void | never => {
    const unknownFields = Object.keys(config).filter((key) => key !== 'client')
    if (unknownFields.length > 0) {
        throw new Error(`Unknown configuration properties: ${unknownFields.join(', ')}`)
    }
}

const tryReadFile = (fileName: string): string|undefined => {
    try {
        return readFileSync(fileName, 'utf8')
    } catch (e: any) {
        return undefined
    }
}

export const getConfig = (id?: string): Config|undefined => {
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
            const json = JSON.parse(content)
            validateConfig(json)
            return json
        }
    }
    return undefined
}