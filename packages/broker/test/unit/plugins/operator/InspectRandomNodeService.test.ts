import {
    FetchRedundancyFactorFn,
    findTarget,
    FindTargetFn,
    InspectRandomNodeService, InspectTargetFn
} from '../../../../src/plugins/operator/InspectRandomNodeService'
import { InspectRandomNodeHelper } from '../../../../src/plugins/operator/InspectRandomNodeHelper'
import { mock, MockProxy } from 'jest-mock-extended'
import { StreamAssignmentLoadBalancer } from '../../../../src/plugins/operator/StreamAssignmentLoadBalancer'
import { randomEthereumAddress } from '@streamr/test-utils'
import { StreamID, StreamPartID, StreamPartIDUtils, toStreamID, toStreamPartID } from '@streamr/protocol'
import { EthereumAddress, wait, waitForCondition } from '@streamr/utils'
import { StreamrClient } from 'streamr-client'

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

    function setStreamPartsAssignedToMe(streamParts: StreamPartID[]): void {
        loadBalancer.getMyStreamParts.mockReturnValue(streamParts)
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

const WAIT_FOR_FLAG_TIMEOUT_IN_MS = 100

const target = Object.freeze({
    sponsorshipAddress: SPONSORSHIP_ADDRESS,
    operatorAddress: OTHER_OPERATOR_ADDRESS,
    streamPart: toStreamPartID(STREAM_ID, 4),
})

describe(InspectRandomNodeService, () => {
    let helper: MockProxy<InspectRandomNodeHelper>
    let loadBalancer: MockProxy<StreamAssignmentLoadBalancer>
    let streamrClient: MockProxy<StreamrClient>
    let service: InspectRandomNodeService
    let findTargetFn: jest.MockedFn<FindTargetFn>
    let inspectTargetFn: jest.MockedFn<InspectTargetFn>
    let fetchRedundancyFactorFn: jest.MockedFn<FetchRedundancyFactorFn>

    beforeEach(() => {
        helper = mock<InspectRandomNodeHelper>()
        loadBalancer = mock<StreamAssignmentLoadBalancer>()
        streamrClient = mock<StreamrClient>()
        findTargetFn = jest.fn()
        inspectTargetFn = jest.fn()
        fetchRedundancyFactorFn = jest.fn()
        fetchRedundancyFactorFn.mockResolvedValueOnce(1)
        service = new InspectRandomNodeService(
            MY_OPERATOR_ADDRESS,
            helper,
            loadBalancer,
            streamrClient,
            200,
            1000,
            findTargetFn,
            inspectTargetFn,
            fetchRedundancyFactorFn
        )
    })

    afterEach(() => {
        service.stop()
    })

    it('does not flag (or even inspect) if does not find target', async () => {
        findTargetFn.mockResolvedValueOnce(undefined)

        await service.start()
        await wait(WAIT_FOR_FLAG_TIMEOUT_IN_MS)

        expect(inspectTargetFn).not.toHaveBeenCalled()
        expect(helper.flagWithMetadata).not.toHaveBeenCalled()
    })

    it('does not flag if inspection passes', async () => {
        findTargetFn.mockResolvedValueOnce(target)
        inspectTargetFn.mockResolvedValueOnce(true)

        await service.start()
        await wait(WAIT_FOR_FLAG_TIMEOUT_IN_MS)

        expect(helper.flagWithMetadata).not.toHaveBeenCalled()
    })

    it('flags if inspection does not pass', async () => {
        findTargetFn.mockResolvedValueOnce(target)
        inspectTargetFn.mockResolvedValueOnce(false)

        await service.start()
        await waitForCondition(() => helper.flagWithMetadata.mock.calls.length > 0)

        expect(helper.flagWithMetadata).toHaveBeenCalledWith(
            SPONSORSHIP_ADDRESS,
            OTHER_OPERATOR_ADDRESS,
            StreamPartIDUtils.getStreamPartition(target.streamPart)
        )
    })

    it('findTarget and inspectTarget are called with correct arguments', async () => {
        findTargetFn.mockResolvedValueOnce(target)
        inspectTargetFn.mockResolvedValueOnce(false)

        await service.start()
        await waitForCondition(() => helper.flagWithMetadata.mock.calls.length > 0)

        expect(findTargetFn).toHaveBeenCalledWith(MY_OPERATOR_ADDRESS, helper, loadBalancer)
        expect(inspectTargetFn).toHaveBeenCalledWith({
            target,
            streamrClient,
            fetchRedundancyFactor: fetchRedundancyFactorFn,
            heartbeatLastResortTimeoutInMs: 1000,
            abortSignal: expect.anything()
        })
    })
})
