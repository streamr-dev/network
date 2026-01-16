import { Methods } from '@streamr/test-utils'
import { Lifecycle, scoped } from 'tsyringe'
import type { NetworkPeerDescriptor } from '../../../src/ConfigTypes'
import { FindOperatorsOnStreamResult, OperatorRegistry } from '../../../src/contracts/OperatorRegistry'
import { toEthereumAddress } from '@streamr/utils'

export const fakeEntrypoint = {
    nodeId: 'dadc0ded',
    websocket: {
        host: 'test',
        port: 12345,
        tls: true,
    }
}

@scoped(Lifecycle.ContainerScoped)
export class FakeOperatorRegistry implements Methods<OperatorRegistry> {

    // eslint-disable-next-line class-methods-use-this
    async findRandomNetworkEntrypoints(): Promise<NetworkPeerDescriptor[]> {
        return [fakeEntrypoint]
    }

    // eslint-disable-next-line class-methods-use-this
    async findOperatorsOnStream(): Promise<FindOperatorsOnStreamResult[]> {
        return [{
            operatorId: toEthereumAddress('0x1234567890123456789012345678901234567890'),
            peerDescriptor: fakeEntrypoint
        }]
    }

}
