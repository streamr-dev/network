import fetch from 'node-fetch'
import { Config } from './config'
import { GenericError } from './errors/GenericError'

export class StorageNodeRegistry {

    urlByAddress: Record<string,string> = {}
    streamrUrl: string

    constructor(urlByAddress: Record<string,string>, streamrUrl: string) {
        this.urlByAddress = urlByAddress
        this.streamrUrl = streamrUrl
    }

    getUrlByAddress(address: string): string|undefined {
        return this.urlByAddress[address]
    }

    static createInstance(config: Config): StorageNodeRegistry|undefined {
        if (config.storageNodeRegistry !== null) {  
            const urlByAddress: Record<string,string> = {}
            config.storageNodeRegistry.forEach((item) => {
                urlByAddress[item.address] = item.url
            })
            return new StorageNodeRegistry(urlByAddress, config.streamrUrl) 
        } else {
            return undefined
        }
    }

    async getUrlByStreamId(streamId: string): Promise<string> {
        const storageNodeAddress = await this.getStorageNodeAddress(streamId)
        if (storageNodeAddress !== undefined) {
            const url = this.getUrlByAddress(storageNodeAddress)
            if (url !== undefined) {
                return url
            } else {
                return Promise.reject(new GenericError(`Storage node not in registry: ${storageNodeAddress}`, 'STORAGE_NODE_NOT_IN_REGISTRY'))
            }
        } else {
            return Promise.reject(new GenericError(`No storage nodes: ${streamId}`, 'NO_STORAGE_NODES'))
        }
    }

    // TODO when we support multiple storage nodes, this method should actually return all
    // addresses. resends should try to fetch from random storage node, and if that fetch fails,
    // it should try to fetch from other addresses, too
    private async getStorageNodeAddress(streamId: string): Promise<string|undefined> {
        const url = `${this.streamrUrl}/api/v1/streams/${encodeURIComponent(streamId)}/storageNodes`
        const response = await fetch(url)
        if (response.status === 200) {
            const items = await response.json()
            const addresses = items.map((item: any) => {
                return item.storageNodeAddress
            })
            if (addresses.length > 0) {
                return addresses[Math.floor(Math.random() * addresses.length)]
            } else if (addresses.length === 0) {
                return undefined
            }    
        } else {
            return Promise.reject(new GenericError(`Unable to list storage nodes: ${streamId}`, 'STORAGE_NODE_LIST_ERROR'))
        }
    }
}