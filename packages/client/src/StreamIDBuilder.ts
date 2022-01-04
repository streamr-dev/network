import { EthereumAddress, isPathOnlyFormat, StreamID, toStreamID as toStreamIDSync } from 'streamr-client-protocol'
import Ethereum from './Ethereum'
import { inject, Lifecycle, scoped } from 'tsyringe'

@scoped(Lifecycle.ContainerScoped)
export class StreamIDBuilder {
    constructor(@inject(Ethereum) private ethereum: Ethereum) {}

    async toStreamID(streamIdOrPath: string): Promise<StreamID> {
        let address: EthereumAddress | undefined
        if (isPathOnlyFormat(streamIdOrPath) && this.ethereum.isAuthenticated()) {
            address = await this.ethereum.getAddress()
        }
        return toStreamIDSync(streamIdOrPath, address)
    }
}
