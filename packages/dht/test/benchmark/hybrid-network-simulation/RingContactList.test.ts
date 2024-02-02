import { ConnectivityResponse, PeerDescriptor } from "../../../src/proto/packages/dht/protos/DhtRpc"
import { createPeerDescriptor } from "../../../src/helpers/createPeerDescriptor"
import { NatType } from "../../../src/connection/ConnectionManager"
import { ipv4ToNumber } from "@streamr/utils"
import { PeerDescriptorDecorator, RingContactList } from "../../../src/dht/contact/RingContactList"


function ipv4ToString(ip: number): string {
    return [
        (ip >>> 24) & 0xFF,
        (ip >>> 16) & 0xFF,
        (ip >>> 8) & 0xFF,
        ip & 0xFF
    ].join('.');
}

class MockNode {
    private readonly peerDescriptor: PeerDescriptor

    constructor(region: number, ipAddress: string) {

        const connectivityResponse: ConnectivityResponse = {
            host: 'localhost',
            natType: NatType.UNKNOWN,
            ipAddress: ipv4ToNumber(ipAddress),
            version: '0.0.0'

        }
        this.peerDescriptor = createPeerDescriptor(connectivityResponse)
        console.log(ipv4ToString(this.peerDescriptor.ipAddress!))
    }

    public getPeerDescriptor(): PeerDescriptor {
        return this.peerDescriptor
    }
}

// populate with mock ip addresses
const mockData: Array< [number, string] > = [
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
const referenceId = (new PeerDescriptorDecorator(referenceNode.getPeerDescriptor())).getRingId()

const ringContactList: RingContactList<MockNode> = new RingContactList<MockNode>(referenceNode.getPeerDescriptor())

mockNodes.forEach((node) => ringContactList.addContact(node))


ringContactList.getLeftNeighbors().forEach((node) => console.log(ipv4ToString(node.getPeerDescriptor().ipAddress!)))
console.log('reference node: ', ipv4ToString(referenceNode.getPeerDescriptor().ipAddress!))
ringContactList.getRightNeighbors().forEach((node) => console.log(ipv4ToString(node.getPeerDescriptor().ipAddress!)))
