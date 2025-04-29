import { ConnectivityResponse, PeerDescriptor } from '../../../generated/packages/dht/protos/DhtRpc'
import { createPeerDescriptor } from '../../../src/helpers/createPeerDescriptor'
import { NatType } from '../../../src/connection/ConnectionManager'
import { ipv4ToNumber, Logger } from '@streamr/utils'
import { RingContactList } from '../../../src/dht/contact/RingContactList'
import { getRingIdRawFromPeerDescriptor } from '../../../src/dht/contact/ringIdentifiers'
import { getRandomRegion } from '../../../src/connection/simulator/pings'

const logger = new Logger(module)

function ipv4ToString(ip: number): string {
    return [
        (ip >>> 24) & 0xFF,
        (ip >>> 16) & 0xFF,
        (ip >>> 8) & 0xFF,
        ip & 0xFF
    ].join('.')
}

class MockNode {
    private readonly peerDescriptorPromise: Promise<PeerDescriptor>

    constructor(_region: number, ipAddress: string) {

        const connectivityResponse: ConnectivityResponse = {
            host: 'localhost',
            natType: NatType.UNKNOWN,
            ipAddress: ipv4ToNumber(ipAddress),
            protocolVersion: '0.0.0'

        }
        this.peerDescriptorPromise = createPeerDescriptor(connectivityResponse, getRandomRegion())
        this.peerDescriptorPromise.then((peerDescriptor) => {
            logger.info(ipv4ToString(peerDescriptor.ipAddress!))
        }).catch((err) => {
            logger.error(`Creating peerDescriptor failed`, err)
        })
    }

    public async getPeerDescriptor(): Promise<PeerDescriptor> {
        return this.peerDescriptorPromise
    }
}

// populate with mock ip addresses
const mockData: [number, string][] = [
    [0, '5.2.4.2'],
    [0, '6.23.2.4'],
    [0, '7.2.4.2'],
    [0, '8.23.2.4'],
    [0, '9.3.2.4'],
    [0, '10.3.2.4'],
    [0, '24.23.2.4'],
    [0, '31.23.2.4'],
    [0, '33.2.4.2'],
    [0, '35.3.2.4'],
    [0, '37.23.2.4'],
    [0, '39.2.4.2'],
    [0, '42.3.2.4'],
    [0, '46.2.4.2'],
    [0, '48.3.2.4'],
    [0, '50.23.2.4']
]

const mockNodes: MockNode[] = mockData.map(([region, ipAddress]) => new MockNode(region, ipAddress))
const referenceNode = mockNodes[5]
const ringContactList: RingContactList<MockNode> = new RingContactList<MockNode>(
    getRingIdRawFromPeerDescriptor(referenceNode.getPeerDescriptor())
)

mockNodes.forEach((node) => ringContactList.addContact(node))

ringContactList.getClosestContacts().left.forEach((node) => logger.info(ipv4ToString(node.getPeerDescriptor().ipAddress!)))
logger.info('reference node: ' + ipv4ToString(referenceNode.getPeerDescriptor().ipAddress!))
ringContactList.getClosestContacts().right.forEach((node) => logger.info(ipv4ToString(node.getPeerDescriptor().ipAddress!)))
