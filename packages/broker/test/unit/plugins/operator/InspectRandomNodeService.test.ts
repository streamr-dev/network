import {
    FindTargetFn,
    InspectRandomNodeService,
    InspectTargetFn
} from '../../../../src/plugins/operator/InspectRandomNodeService'
import { InspectRandomNodeHelper } from '../../../../src/plugins/operator/InspectRandomNodeHelper'
import { mock, MockProxy } from 'jest-mock-extended'
import { StreamAssignmentLoadBalancer } from '../../../../src/plugins/operator/StreamAssignmentLoadBalancer'
import { randomEthereumAddress } from '@streamr/test-utils'
import { StreamPartIDUtils, toStreamID, toStreamPartID } from '@streamr/protocol'
import { EthereumAddress, wait, waitForCondition } from '@streamr/utils'
import { StreamrClient } from 'streamr-client'

const MY_OPERATOR_ADDRESS = randomEthereumAddress()
const OTHER_OPERATOR_ADDRESS = randomEthereumAddress()
const SPONSORSHIP_ADDRESS = randomEthereumAddress()
const STREAM_ID = toStreamID('streamId')

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
    let getRedundancyFactorFn: jest.MockedFn<(operatorContractAddress: EthereumAddress) => Promise<number | undefined>>

    beforeEach(() => {
        helper = mock<InspectRandomNodeHelper>()
        loadBalancer = mock<StreamAssignmentLoadBalancer>()
        streamrClient = mock<StreamrClient>()
        findTargetFn = jest.fn()
        inspectTargetFn = jest.fn()
        getRedundancyFactorFn = jest.fn()
        getRedundancyFactorFn.mockResolvedValueOnce(1)
        service = new InspectRandomNodeService(
            MY_OPERATOR_ADDRESS,
            helper,
            loadBalancer,
            streamrClient,
            200,
            1000,
            getRedundancyFactorFn,
            findTargetFn,
            inspectTargetFn
        )
    })

    afterEach(() => {
        service.stop()
    })

    it('does not flag (or inspect) if does not find target', async () => {
        findTargetFn.mockResolvedValueOnce(undefined)

        await service.start()
        await wait(WAIT_FOR_FLAG_TIMEOUT_IN_MS)

        expect(inspectTargetFn).not.toHaveBeenCalled()
        expect(helper.flag).not.toHaveBeenCalled()
    })

    it('does not flag if inspection passes', async () => {
        findTargetFn.mockResolvedValueOnce(target)
        inspectTargetFn.mockResolvedValueOnce(true)

        await service.start()
        await wait(WAIT_FOR_FLAG_TIMEOUT_IN_MS)

        expect(helper.flag).not.toHaveBeenCalled()
    })

    it('flags if inspection does not pass', async () => {
        findTargetFn.mockResolvedValueOnce(target)
        inspectTargetFn.mockResolvedValueOnce(false)

        await service.start()
        await waitForCondition(() => helper.flag.mock.calls.length > 0)

        expect(helper.flag).toHaveBeenCalledWith(
            SPONSORSHIP_ADDRESS,
            OTHER_OPERATOR_ADDRESS,
            StreamPartIDUtils.getStreamPartition(target.streamPart)
        )
    })

    it('findTarget and inspectTarget are called with correct arguments', async () => {
        findTargetFn.mockResolvedValueOnce(target)
        inspectTargetFn.mockResolvedValueOnce(false)

        await service.start()
        await waitForCondition(() => helper.flag.mock.calls.length > 0)

        expect(findTargetFn).toHaveBeenCalledWith(MY_OPERATOR_ADDRESS, helper, loadBalancer)
        expect(inspectTargetFn).toHaveBeenCalledWith({
            target,
            streamrClient,
            getRedundancyFactorFn,
            heartbeatLastResortTimeoutInMs: 1000,
            abortSignal: expect.anything()
        })
    })
})
