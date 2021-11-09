import { Protocol } from 'streamr-network'

export const createMockStorageConfig = (spids: Protocol.SPID[]): any => {
    return {
        hasSPID: (spid: Protocol.SPID) => {
            return spids.some((s) => (s.streamId === spid.streamId) && (s.streamPartition === spid.streamPartition))
        },
        getSPIDs: () => {
            return spids
        },
        addChangeListener: () => {},
        startAssignmentEventListener: jest.fn(),
        stopAssignmentEventListener: jest.fn(),
        cleanup: jest.fn().mockResolvedValue(undefined)
    }
}
