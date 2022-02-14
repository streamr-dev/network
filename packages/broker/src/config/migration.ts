import fs from 'fs'
import path from 'path'
import { get, omitBy, set } from 'lodash'
import { Config, getDefaultFile, getLegacyDefaultFile } from './config'
import { isValidConfig } from './validateConfig'
import TEST_CONFIG_SCHEMA from './config-testnet.schema.json'

export const CURRENT_CONFIGURATION_VERSION = 1

export const formSchemaUrl = (version: number): string => {
    return `http://schema.streamr.com/config-v${version}.schema.json`
}

const getVersion = (config: any): number | undefined => {
    const PATTERN = /config-v([0-9]+).schema.json$/
    const schemaUrl = config.$schema
    if (schemaUrl !== undefined) {
        const match = PATTERN.exec(schemaUrl)
        if (match !== null) {
            return Number(match[1])
        }
    }
    return undefined
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const needsMigration = (config: any): boolean => {
    return getVersion(config) !== CURRENT_CONFIGURATION_VERSION
}

/*
 * Migrate a Testnet3 config to the new format used in Brubeck mainnet.
 *
 * Some new features were added between Testnet3 and Brubeck mainnet. The migration assumes
 * that a source config doesn't contain settings for those features. Therefore it ignores:
 * - network.webrtcDisallowPrivateAddresses
 * - subscriber plugin
 */
const convertTestnet3ToV1 = (source: any): Config => {
    const TARGET_VERSION = 1
    const DEFAULT_NAME = 'miner-node'
    const target: any = {
        $schema: formSchemaUrl(TARGET_VERSION)
    }

    const copyProperty = (sourceName: string, targetName?: string, transform?: (sourceValue: any) => any) => {
        const sourceValue = get(source, sourceName)
        const targetValue = (transform !== undefined) ? transform(sourceValue) : sourceValue
        if (targetValue !== undefined) {
            set(target, targetName ?? sourceName, targetValue)
        }
    }

    /*
     * Most user-configurable properties are copied. Drop these configurable values:
     * - client.network.location if null, as the non-defined location is the default value in v1
     * - network.name if equals to 'miner-node', as all Brubeck mainnet nodes aren't miners
     * 
     * Also drop properties, which are settings about the environment (that is, Testnet3 values 
     * in the source config). As a consequence, the node will apply Brubeck mainnet defaults 
     * for these properties:
     * - restUrl
     * - trackers
     * - network.stun and network.turn
     * - generateSessionId (the migrated node will always use session id)
     * - streamrAddress (not needed in Brubeck mainnet)
     * - storageNodeConfig (configured as a registry address in Brubeck mainnet)
     */
    copyProperty('ethereumPrivateKey', 'client.auth.privateKey')
    copyProperty('network.name', 'client.network.name', (value) => (value !== DEFAULT_NAME) ? value : undefined)
    copyProperty('network.location', 'client.network.location', 
        (value) => (value !== null) ? omitBy(value, (fieldValue: any) => fieldValue === null) : undefined)
    copyProperty('httpServer')
    copyProperty('apiAuthentication')

    /*
     * Copy plugins:
     * - all API-plugins
     * - miner plugin renamed (all settings are specific to Brubeck mainnet)
     * - metrics plugin (nodeMetrics settings are specific to Brubeck mainnet)
     * 
     * Legacy plugins are dropped. Migrating a storage plugin is not supported.
     */
    target.plugins = {}
    Object.keys(source.plugins).forEach((name) => {
        const sourceConfig = source.plugins[name]
        if (['websocket', 'mqtt', 'publishHttp'].includes(name)) {
            target.plugins[name] = sourceConfig
        } else if (name === 'testnetMiner') {
            target.plugins.brubeckMiner = {}
        } else if (name === 'metrics') {
            const targetConfig: any = {}
            if (sourceConfig.consoleAndPM2IntervalInSeconds !== 0) {
                targetConfig.consoleAndPM2IntervalInSeconds = sourceConfig.consoleAndPM2IntervalInSeconds
            }
            target.plugins.metrics = targetConfig
        } else if (['legacyWebsocket', 'legacyMqtt'].includes(name)) {
            // no-op
        } else {
            throw new Error(`Migration not supported for plugin: ${name}`)
        }
    })
    return target as Config
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const createMigratedConfig = (source: any): Config | never => {
    const version = getVersion(source)
    const isTestnetConfig = (version === undefined) && (isValidConfig(source, TEST_CONFIG_SCHEMA))
    if (isTestnetConfig) {
        return convertTestnet3ToV1(source)
    } else {
        throw new Error('Unable to migrate the config')
    }
}

/* 
 * Creates a backup file name, derived from the given name. Ensures that no file exist with that name.
 * - foobar.ext.backup
 * - or foobar.ext.backup-123
 */
const formBackupFileName = (originalFileName: string) => {
    const name = `${originalFileName}.backup`
    if (!fs.existsSync(name)) {
        return name
    } else {
        let suffix = 1
        while (true) {
            const suffixedName = `${name}-${suffix}`
            if (!fs.existsSync(suffixedName)) {
                return suffixedName
            }
            suffix++
        }
    }
}

export const readConfigAndMigrateIfNeeded = (fileName: string | undefined): Config | never => {
    let explicitTargetFile = undefined
    if (fileName === undefined) {
        const defaultTargetFile = getDefaultFile()
        const legacyTargetFile = getLegacyDefaultFile()
        fileName = [defaultTargetFile, legacyTargetFile].find((file) => fs.existsSync(file))
        if (fileName === undefined) {
            // eslint-disable-next-line max-len
            throw new Error(`Config file not found in the default location. You can run "streamr-broker-init" to generate a config file interactively, or specify the config file as argument: "streamr-broker path-to-config/file.json"`)
        }
        if (fileName === legacyTargetFile) {
            /*
             * User has not specified the config file location in the command line and we found
             * the file from the legacy default location. We'll write the migrated file to current 
             * default location instead of the legacy default location. There is no need to backup 
             * the file as we won't overwrite anything.
             */
            explicitTargetFile = defaultTargetFile
        }
    }
    let content = JSON.parse(fs.readFileSync(fileName, 'utf8'))
    if (needsMigration(content)) {
        if (explicitTargetFile === undefined) {
            const backupFile = formBackupFileName(fileName)
            // eslint-disable-next-line no-console
            console.log(`Migrating config ${fileName}, saving backup to ${backupFile}`)
            fs.copyFileSync(fileName, backupFile)
            content = createMigratedConfig(content)
            fs.writeFileSync(fileName, JSON.stringify(content, undefined, 4))
        } else {
            const backupFile = formBackupFileName(fileName)
            // eslint-disable-next-line no-console
            console.log(`Migrating config ${fileName} to ${explicitTargetFile} (archiving the original file to ${backupFile})`)
            content = createMigratedConfig(content)
            const directory = path.dirname(explicitTargetFile)
            if (!fs.existsSync(directory)) {
                fs.mkdirSync(directory, {
                    recursive: true
                })
            }
            fs.writeFileSync(explicitTargetFile, JSON.stringify(content, undefined, 4))
            // read permissions from the source file and set the same permissions to the target file
            fs.chmodSync(explicitTargetFile, (fs.statSync(fileName).mode & parseInt('777', 8)).toString(8))
            fs.renameSync(fileName, backupFile)
        }
    }
    return content
}