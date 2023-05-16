import { DhtRpcOptions } from "../exports"
import { DataEntry, FindDataRequest } from "../proto/packages/dht/protos/DhtRpc"
import { IExternalApiServiceClient } from "../proto/packages/dht/protos/DhtRpc.client"
import { Remote } from "./contact/Remote"

export class RemoteExternalApi extends Remote<IExternalApiServiceClient> {

    async findData(idToFind: Uint8Array): Promise<DataEntry[]> {
        const request: FindDataRequest = {
            kademliaId: idToFind,
            requestor: this.ownPeerDescriptor,
        }
        const options: DhtRpcOptions = {
            sourceDescriptor: this.ownPeerDescriptor,
            targetDescriptor: this.peerDescriptor,
            timeout: 10000
        }
        try {
            const data = await this.client.findData(request, options)
            return data.dataEntries
        } catch (err) {
            return []
        }
    }
}
