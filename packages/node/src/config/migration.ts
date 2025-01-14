import fs from 'fs'
import path from 'path'
import cloneDeep from 'lodash/cloneDeep'
import { ConfigFile, getDefaultFile, getLegacyDefaultFile } from './config'

export const CURRENT_CONFIGURATION_VERSION = 3

export const formSchemaUrl = (version: number): string => {
    return `https://schema.streamr.network/config-v${version}.schema.json`
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
    return getVersion(config) !== undefined && getVersion(config) !== CURRENT_CONFIGURATION_VERSION
}

const convertV1ToV2 = (source: any): ConfigFile => {
    const TARGET_VERSION = 2
    const target = cloneDeep(source)
    target.$schema = formSchemaUrl(TARGET_VERSION)
    const consoleAndPM2IntervalInSeconds = source.plugins.metrics?.consoleAndPM2IntervalInSeconds
    if (consoleAndPM2IntervalInSeconds !== undefined && consoleAndPM2IntervalInSeconds !== 0) {
        target.plugins.consoleMetrics = {
            interval: consoleAndPM2IntervalInSeconds
        }
        delete target.plugins.metrics.consoleAndPM2IntervalInSeconds
    }
    const isMetricsPluginEnabled = source.plugins.metrics !== undefined && source.plugins.metrics.nodeMetrics !== null
    if (isMetricsPluginEnabled) {
        const streamIdPrefix: string | undefined = source.plugins.metrics.nodeMetrics?.streamIdPrefix
        if (streamIdPrefix !== undefined) {
            target.client.metrics = {
                periods: [
                    {
                        duration: 60000,
                        streamId: `${streamIdPrefix}/min`
                    },
                    {
                        duration: 3600000,
                        streamId: `${streamIdPrefix}/hour`
                    },
                    {
                        duration: 86400000,
                        streamId: `${streamIdPrefix}/day`
                    }
                ]
            }
        }
    } else {
        target.client.metrics = false
    }
    delete target.plugins.metrics
    if (target.client?.network?.name !== undefined) {
        delete target.client.network.name
    }
    if (source.plugins.publishHttp !== undefined) {
        target.plugins.http = source.plugins.publishHttp
        delete target.plugins.publishHttp
    }
    const deleteNullProperties = (obj: any, excludeKeys: string[] = []) => {
        const keys = Object.keys(obj)
        for (const key of keys) {
            if (obj[key] === null && !excludeKeys.includes(key)) {
                delete obj[key]
            }
        }
    }
    deleteNullProperties(target)
    if (target.httpServer !== undefined) {
        deleteNullProperties(target.httpServer)
    }
    if (target.plugins.brubeckMiner !== undefined) {
        deleteNullProperties(target.plugins.brubeckMiner, ['stunServerHost'])
    }
    if (target.plugins.mqtt !== undefined) {
        deleteNullProperties(target.plugins.mqtt)
    }
    if (target.plugins.storage !== undefined) {
        deleteNullProperties(target.plugins.storage.cluster)
    }
    if (target.plugins.websocket !== undefined) {
        deleteNullProperties(target.plugins.websocket)
    }
    if (target.httpServer?.certFileName !== undefined || target.httpServer?.privateKeyFileName !== undefined) {
        target.httpServer.sslCertificate = {
            certFileName: target.httpServer.certFileName,
            privateKeyFileName: target.httpServer.privateKeyFileName
        }
        delete target.httpServer.certFileName
        delete target.httpServer.privateKeyFileName
    }
    return target as ConfigFile
}

const convertV2ToV3 = (source: any): ConfigFile => {
    const TARGET_VERSION = 3
    const target = cloneDeep(source)
    target.$schema = formSchemaUrl(TARGET_VERSION)
    return target as ConfigFile
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const createMigratedConfig = (source: any): ConfigFile | never => {
    let config = source
    do {
        const version = getVersion(config)
        if (version === 1) {
            config = convertV1ToV2(config)
        } else if (version === 2) {
            config = convertV2ToV3(config)
        } else {
            throw new Error(`Unable to migrate the config: version=${version}`)
        }
    } while (needsMigration(config))
    return config
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

export const readConfigAndMigrateIfNeeded = (fileName: string | undefined): ConfigFile | never => {
    let explicitTargetFile = undefined
    if (fileName === undefined) {
        const defaultTargetFile = getDefaultFile()
        const legacyTargetFile = getLegacyDefaultFile()
        fileName = [defaultTargetFile, legacyTargetFile].find((file) => fs.existsSync(file))
        if (fileName === undefined) {
            /*
             * No config file. Some config options are maybe set with enviroment variables
             * (see overrideConfigToEnvVarsIfGiven function), and others just
             * use the default values (see `default` definitions in config.schema.json)
             */
            return {}
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
            console.log(
                `Migrating config ${fileName} to ${explicitTargetFile} (archiving the original file to ${backupFile})`
            )
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
