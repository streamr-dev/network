import fs from 'fs'
import { Server as HttpServer } from 'http'
import https, { Server as HttpsServer } from 'https'
import { AddressInfo } from 'net'
import cors from 'cors'
import express from 'express'
import { Logger } from 'streamr-network'
import { router as dataQueryEndpoints } from './DataQueryEndpoints'
import { router as dataProduceEndpoints } from './DataProduceEndpoints'
import { router as volumeEndpoint } from './VolumeEndpoint'
import { router as dataMetadataEndpoint } from './DataMetadataEndpoints'
import { router as storageConfigEndpoints } from './StorageConfigEndpoints'
import { Plugin, PluginOptions, PluginConfig } from '../Plugin'
import { StreamFetcher } from '../StreamFetcher'

const logger = new Logger(module)

export interface HttpPluginConfig extends PluginConfig {
    privateKeyFileName: string|null, 
    certFileName: string|null
}

export class HttpPlugin extends Plugin<HttpPluginConfig> {

    httpServer: HttpServer|HttpsServer|undefined

    constructor(options: PluginOptions<HttpPluginConfig>) {
        super(options)
    }

    async start() {
        const streamFetcher = new StreamFetcher(this.config.streamrUrl)
        const app = express()
        app.use(cors())
        app.use('/api/v1', dataProduceEndpoints(streamFetcher, this.publisher))
        app.use('/api/v1', volumeEndpoint(this.metricsContext))    
        if (this.config.network.isStorageNode) {
            app.use('/api/v1', dataQueryEndpoints(this.cassandraStorage!, streamFetcher, this.metricsContext))
            app.use('/api/v1', dataMetadataEndpoint(this.cassandraStorage!))
            app.use('/api/v1', storageConfigEndpoints(this.storageConfig!))    
        }
        if (this.pluginConfig.privateKeyFileName && this.pluginConfig.certFileName) {
            this.httpServer = https.createServer({
                cert: fs.readFileSync(this.pluginConfig.certFileName),
                key: fs.readFileSync(this.pluginConfig.privateKeyFileName)
            }, app).listen(this.pluginConfig.port, () => logger.info(`HTTPS plugin listening on ${(this.httpServer!.address() as AddressInfo).port}`))
        } else {
            this.httpServer = app.listen(this.pluginConfig.port, () => logger.info(`HTTP plugin listening on ${(this.httpServer!.address() as AddressInfo).port}`))
        }
    }

    async stop() {
        return new Promise((resolve, reject) => {
            this.httpServer!.close((err?: Error) => {
                if (err) {
                    reject(err)
                } else {
                    // @ts-expect-error
                    resolve()
                }
            })
        })
    }
}