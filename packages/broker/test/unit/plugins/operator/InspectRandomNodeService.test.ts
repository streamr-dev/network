import {
    FetchRedundancyFactorFn,
    findNodesForTarget,
    FindNodesForTargetFn,
    findTarget,
    FindTargetFn,
    InspectRandomNodeService
} from '../../../../src/plugins/operator/InspectRandomNodeService'
import { InspectRandomNodeHelper } from '../../../../src/plugins/operator/InspectRandomNodeHelper'
import { mock, MockProxy } from 'jest-mock-extended'
import { StreamAssignmentLoadBalancer } from '../../../../src/plugins/operator/StreamAssignmentLoadBalancer'
import { randomEthereumAddress } from '@streamr/test-utils'
import { StreamID, StreamPartID, StreamPartIDUtils, toStreamID, toStreamPartID } from '@streamr/protocol'
import { EthereumAddress, wait, waitForCondition } from '@streamr/utils'
import { MessageListener, NetworkPeerDescriptor, StreamrClient, Subscription } from 'streamr-client'
import { createHeartbeatMessage } from '../../../../src/plugins/operator/heartbeatUtils'

const MY_OPERATOR_ADDRESS = randomEthereumAddress()
const OTHER_OPERATOR_ADDRESS = randomEthereumAddress()
const SPONSORSHIP_ADDRESS = randomEthereumAddress()
const STREAM_ID = toStreamID('streamId')

describe(findTarget, () => {
    let helper: MockProxy<InspectRandomNodeHelper>
    let loadBalancer: MockProxy<StreamAssignmentLoadBalancer>

    function setupEnv(sponsorships: Array<{ address: EthereumAddress, operators: EthereumAddress[], streamId: StreamID }>) {
        helper.getSponsorshipsOfOperator.mockImplementation(async (operatorAddress) => {
            return sponsorships
                .filter(({ operators }) => operators.includes(operatorAddress))
                .map(({ address, operators, streamId }) => ({
                    sponsorshipAddress: address,
                    operatorCount: operators.length,
                    streamId,
                }))
        })
        helper.getOperatorsInSponsorship.mockImplementation(async (sponsorshipAddress) => {
            return sponsorships.find(({ address }) => address === sponsorshipAddress)!.operators
        })
    }

    function setStreamPartsAssignedToMe(streamParts: StreamPartID[]) {
        loadBalancer.getPartitionsOfStreamAssignedToMe.mockImplementation((streamId) => {
            return streamParts.filter((streamPart) => StreamPartIDUtils.getStreamID(streamPart) === streamId)
        })
        loadBalancer.isAnyPartitionOfStreamAssignedToMe.mockImplementation((streamId) => {
            return streamParts.some((streamPart) => StreamPartIDUtils.getStreamID(streamPart) === streamId)
        })
    }

    beforeEach(() => {
        helper = mock<InspectRandomNodeHelper>()
        loadBalancer = mock<StreamAssignmentLoadBalancer>()
    })

    it('returns undefined if no sponsorships are found', async () => {
        setupEnv([])
        setStreamPartsAssignedToMe([])
        const result = await findTarget(MY_OPERATOR_ADDRESS, helper, loadBalancer)
        expect(result).toBeUndefined()
    })

    it('returns undefined if only finds sponsorship with my operator as only operator', async () => {
        setupEnv([{
            address: SPONSORSHIP_ADDRESS,
            operators: [MY_OPERATOR_ADDRESS],
            streamId: STREAM_ID,
        }])
        setStreamPartsAssignedToMe([])
        const result = await findTarget(MY_OPERATOR_ADDRESS, helper, loadBalancer)
        expect(result).toBeUndefined()
    })

    it('returns undefined if no sponsorships found with a partition assigned to me', async () => {
        setupEnv([{
            address: SPONSORSHIP_ADDRESS,
            operators: [MY_OPERATOR_ADDRESS, OTHER_OPERATOR_ADDRESS],
            streamId: STREAM_ID,
        }])
        setStreamPartsAssignedToMe([])
        const result = await findTarget(MY_OPERATOR_ADDRESS, helper, loadBalancer)
        expect(result).toBeUndefined()
    })

    it('returns target sponsorship, operator and stream part', async () => {
        setupEnv([{
            address: SPONSORSHIP_ADDRESS,
            operators: [MY_OPERATOR_ADDRESS, OTHER_OPERATOR_ADDRESS],
            streamId: STREAM_ID,
        }])
        setStreamPartsAssignedToMe([
            toStreamPartID(STREAM_ID, 0),
            toStreamPartID(STREAM_ID, 1),
            toStreamPartID(STREAM_ID, 2),
        ])

        const result = await findTarget(MY_OPERATOR_ADDRESS, helper, loadBalancer)
        expect(result).toMatchObject({
            sponsorshipAddress: SPONSORSHIP_ADDRESS,
            operatorAddress: OTHER_OPERATOR_ADDRESS,
            streamPart: expect.stringMatching(/^streamId#\d$/)
        })
    })

    // TODO: few edge-cases where state changes during asynchronicity
})

const PEER_DESCRIPTOR_ONE = { id: '0x1111' }
const PEER_DESCRIPTOR_TWO = { id: '0x2222' }
const PEER_DESCRIPTOR_THREE = { id: '0x3333' }

const target = Object.freeze({
    sponsorshipAddress: SPONSORSHIP_ADDRESS,
    operatorAddress: OTHER_OPERATOR_ADDRESS,
    streamPart: toStreamPartID(STREAM_ID, 4),
})

describe(findNodesForTarget, () => {
    let streamrClient: MockProxy<StreamrClient>
    let fetchRedundancyFactorFn: jest.MockedFn<FetchRedundancyFactorFn>
    let abortController: AbortController
    let capturedMessageHandler: MessageListener
    let resultPromise: Promise<NetworkPeerDescriptor[]>

    beforeEach(() => {
        streamrClient = mock<StreamrClient>()
        streamrClient.subscribe.mockImplementation(async (_options, callback) => {
            capturedMessageHandler = callback!
            return mock<Subscription>()
        })
        fetchRedundancyFactorFn = jest.fn()
        abortController = new AbortController()
        resultPromise = findNodesForTarget(target, streamrClient, fetchRedundancyFactorFn, 100, abortController.signal)
    })

    afterEach(() => {
        abortController.abort()
    })

    function comeOnline(peerDescriptor: NetworkPeerDescriptor): void {
        capturedMessageHandler(createHeartbeatMessage(peerDescriptor), undefined as any)
    }

    it('returns empty array if no nodes found', async () => {
        const result = await resultPromise
        expect(result).toEqual([])
    })

    it('returns empty array if redundancy factor is undefined', async () => {
        fetchRedundancyFactorFn.mockResolvedValueOnce(undefined)
        comeOnline(PEER_DESCRIPTOR_ONE)
        comeOnline(PEER_DESCRIPTOR_TWO)
        const result = await resultPromise
        expect(result).toEqual([])
    })

    it('returns the single node if single node found', async () => {
        fetchRedundancyFactorFn.mockResolvedValueOnce(1)
        comeOnline(PEER_DESCRIPTOR_ONE)
        const result = await resultPromise
        expect(result).toEqual([PEER_DESCRIPTOR_ONE])
    })

    it('returns one of the nodes if multiple nodes found (replicationFactor=1)', async () => {
        fetchRedundancyFactorFn.mockResolvedValueOnce(1)
        comeOnline(PEER_DESCRIPTOR_ONE)
        comeOnline(PEER_DESCRIPTOR_TWO)
        comeOnline(PEER_DESCRIPTOR_THREE)
        const result = await resultPromise
        expect(result.length).toEqual(1)
        expect(result).toIncludeAnyMembers([PEER_DESCRIPTOR_ONE, PEER_DESCRIPTOR_TWO, PEER_DESCRIPTOR_THREE])
    })

    it('returns two of the nodes if multiple nodes found (replicationFactor=2)', async () => {
        fetchRedundancyFactorFn.mockResolvedValueOnce(2)
        comeOnline(PEER_DESCRIPTOR_ONE)
        comeOnline(PEER_DESCRIPTOR_TWO)
        comeOnline(PEER_DESCRIPTOR_THREE)
        const result = await resultPromise
        expect(result.length).toEqual(2)
        expect(result).toIncludeAnyMembers([PEER_DESCRIPTOR_ONE, PEER_DESCRIPTOR_TWO, PEER_DESCRIPTOR_THREE])
        expect(result[0]).not.toEqual(result[1])
    })
})

const WAIT_FOR_FLAG_TIMEOUT_IN_MS = 100

describe(InspectRandomNodeService, () => {
    let helper: MockProxy<InspectRandomNodeHelper>
    let loadBalancer: MockProxy<StreamAssignmentLoadBalancer>
    let streamrClient: MockProxy<StreamrClient>
    let service: InspectRandomNodeService
    let findTargetFn: jest.MockedFn<FindTargetFn>
    let findNodesForTargetFn: jest.MockedFn<FindNodesForTargetFn>
    let fetchRedundancyFactorFn: jest.MockedFn<FetchRedundancyFactorFn>

    beforeEach(() => {
        helper = mock<InspectRandomNodeHelper>()
        loadBalancer = mock<StreamAssignmentLoadBalancer>()
        streamrClient = mock<StreamrClient>()
        findTargetFn = jest.fn()
        findTargetFn.mockResolvedValueOnce(target)
        findNodesForTargetFn = jest.fn()
        findNodesForTargetFn.mockResolvedValueOnce([PEER_DESCRIPTOR_ONE, PEER_DESCRIPTOR_TWO])
        fetchRedundancyFactorFn = jest.fn()
        fetchRedundancyFactorFn.mockResolvedValueOnce(1)
        service = new InspectRandomNodeService(
            MY_OPERATOR_ADDRESS,
            helper,
            loadBalancer,
            streamrClient,
            100,
            1000,
            findTargetFn,
            findNodesForTargetFn,
            fetchRedundancyFactorFn
        )
    })

    it('does not flag if inspection passes', async () => {
        streamrClient.inspect.calledWith(PEER_DESCRIPTOR_ONE, target.streamPart).mockResolvedValueOnce(false)
        streamrClient.inspect.calledWith(PEER_DESCRIPTOR_TWO, target.streamPart).mockResolvedValueOnce(true)

        await service.start()

        await waitForCondition(() => findTargetFn.mock.calls.length > 0)
        expect(findTargetFn).toHaveBeenCalledWith(MY_OPERATOR_ADDRESS, helper, loadBalancer)

        await waitForCondition(() => findNodesForTargetFn.mock.calls.length > 0)
        expect(findNodesForTargetFn).toHaveBeenCalledWith(
            target,
            streamrClient,
            fetchRedundancyFactorFn,
            1000,
            expect.anything()
        )

        await waitForCondition(() => streamrClient.inspect.mock.calls.length >= 2)
        expect(streamrClient.inspect).toHaveBeenCalledWith(PEER_DESCRIPTOR_ONE, target.streamPart)
        expect(streamrClient.inspect).toHaveBeenCalledWith(PEER_DESCRIPTOR_TWO, target.streamPart)

        await wait(WAIT_FOR_FLAG_TIMEOUT_IN_MS)
        expect(helper.flagWithMetadata).not.toHaveBeenCalled()

        await service.stop()
    })

    it('does not flag if a target is not found', async () => {
        findTargetFn.mockReset().mockResolvedValueOnce(undefined)

        await service.start()

        await wait(WAIT_FOR_FLAG_TIMEOUT_IN_MS)
        expect(helper.flagWithMetadata).not.toHaveBeenCalled()

        await service.stop()
    })

    it('flags if inspection fails', async () => {
        streamrClient.inspect.calledWith(PEER_DESCRIPTOR_ONE, target.streamPart).mockResolvedValueOnce(false)
        streamrClient.inspect.calledWith(PEER_DESCRIPTOR_TWO, target.streamPart).mockResolvedValueOnce(false)

        await service.start()

        await waitForCondition(() => helper.flagWithMetadata.mock.calls.length > 0)
        expect(helper.flagWithMetadata).toHaveBeenCalledWith(SPONSORSHIP_ADDRESS, OTHER_OPERATOR_ADDRESS, 4)

        await service.stop()
    })

    it('flags if no online nodes found', async () => {
        findNodesForTargetFn.mockReset().mockResolvedValueOnce([])

        await service.start()

        await waitForCondition(() => helper.flagWithMetadata.mock.calls.length > 0)
        expect(helper.flagWithMetadata).toHaveBeenCalledWith(SPONSORSHIP_ADDRESS, OTHER_OPERATOR_ADDRESS, 4)

        await service.stop()
    })
})
