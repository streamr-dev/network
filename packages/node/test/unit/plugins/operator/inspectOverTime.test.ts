import { randomDhtAddress } from '@streamr/dht'
import { randomEthereumAddress } from '@streamr/test-utils'
import { StreamPartIDUtils } from '@streamr/utils'
import { inspectOverTime } from '../../../../src/plugins/operator/inspectOverTime'

describe('inspectOverTime', () => {
    it('getRedundancyFactor() rejects (NET-1377)', async () => {
        const task = inspectOverTime({
            target: {
                sponsorshipAddress: randomEthereumAddress(),
                operatorAddress: randomEthereumAddress(),
                streamPart: StreamPartIDUtils.parse('stream#0')
            },
            streamrClient: undefined as any,
            createOperatorFleetState: () =>
                ({
                    getNodeIds: () => [randomDhtAddress()],
                    start: async () => {},
                    waitUntilReady: () => Promise.resolve(),
                    destroy: async () => {}
                }) as any,
            getRedundancyFactor: () => Promise.reject(new Error('mock-error')),
            delayBeforeFirstInspectionInMs: 0,
            heartbeatTimeoutInMs: 0,
            inspectionIntervalInMs: 1000,
            maxInspectionCount: 1,
            waitUntilPassOrDone: true,
            abortSignal: new AbortController().signal,
            traceId: ''
        })
        await expect(task()).resolves.toEqual([])
    })
})
