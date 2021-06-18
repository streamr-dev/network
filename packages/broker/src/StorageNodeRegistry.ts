import fetch from 'node-fetch'
import { Config } from './config'
import { GenericError } from './errors/GenericError'
import { Logger } from 'streamr-network'

export class StorageNodeRegistry {

    urlByAddress: Record<string,string> = {}
    streamrUrl: string
    logger: Logger
    constructor(urlByAddress: Record<string,string>, streamrUrl: string) {
        this.urlByAddress = urlByAddress
        this.streamrUrl = streamrUrl
        this.logger = new Logger(module)
    }

    getUrlByAddress(address: string): string|undefined {
        return this.urlByAddress[address]
    }

    static createInstance(config: Config): StorageNodeRegistry {
        const urlByAddress: Record<string,string> = {}
        config.storageNodeRegistry.forEach((item) => {
            urlByAddress[item.address] = item.url
        })
        return new StorageNodeRegistry(urlByAddress, config.streamrUrl)
    }

    async getUrlsByStreamId(streamId: string): Promise<string[]> {
        const storageNodeAddresses = await this.getStorageNodeAddresses(streamId)
        if (storageNodeAddresses.length > 0) {
            const urls = storageNodeAddresses.reduce((result: string[], address: string): string[] => {
                const url = this.getUrlByAddress(address)
                if (url) {
                    result.push(url)
                } else {
                    this.logger.warn(`Storage node ${address} for ${streamId} not in registry ${storageNodeAddresses}`)
                }
                return result
            }, [])

            if (urls.length > 0) {
                return urls
            } else {
                return Promise.reject(new GenericError(`Storage node not in registry: ${storageNodeAddresses}`, 'STORAGE_NODE_NOT_IN_REGISTRY'))
            }
        } else {
            return Promise.reject(new GenericError(`No storage nodes: ${streamId}`, 'NO_STORAGE_NODES'))
        }
    }

    private async getStorageNodeAddresses(streamId: string): Promise<string[]> {
        const url = `${this.streamrUrl}/api/v1/streams/${encodeURIComponent(streamId)}/storageNodes`
        const response = await fetch(url)
        if (response.status === 200) {
            const items = await response.json()
            const addresses = items.map((item: any) => {
                return item.storageNodeAddress
            })
            return addresses
        } else {
            return Promise.reject(new GenericError(`Unable to list storage nodes: ${streamId}`, 'STORAGE_NODE_LIST_ERROR'))
        }
    }
}