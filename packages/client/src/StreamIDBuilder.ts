import { EthereumAddress, StreamIDUtils, StreamID } from 'streamr-client-protocol'
import Ethereum from './Ethereum'
import { inject, Lifecycle, scoped } from 'tsyringe'

@scoped(Lifecycle.ContainerScoped)
export class StreamIDBuilder {
    constructor(@inject(Ethereum) private ethereum: Ethereum) {}

    async toStreamID(streamIdOrPath: string): Promise<StreamID> {
        let address: EthereumAddress | undefined
        if (StreamIDUtils.isPathOnlyFormat(streamIdOrPath) && this.ethereum.isAuthenticated()) {
            address = await this.ethereum.getAddress()
        }
        return StreamIDUtils.toStreamID(streamIdOrPath, address)
    }
}
