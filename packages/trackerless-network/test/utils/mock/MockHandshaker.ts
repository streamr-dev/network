import { NodeID } from '../../../src/identifiers'
import { IHandshaker } from '../../../src/logic/neighbor-discovery/Handshaker'

export class MockHandshaker implements IHandshaker {

    // eslint-disable-next-line class-methods-use-this
    getOngoingHandshakes(): Set<NodeID> {
        return new Set()
    }

    // eslint-disable-next-line class-methods-use-this
    async attemptHandshakesOnContacts(excludedIds: NodeID[]): Promise<NodeID[]> {
        return excludedIds
    }

}
