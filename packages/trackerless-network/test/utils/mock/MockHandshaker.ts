import { IHandshaker } from '../../../src/logic/neighbor-discovery/Handshaker'

export class MockHandshaker implements IHandshaker {

    // eslint-disable-next-line class-methods-use-this
    getOngoingHandshakes(): Set<string> {
        return new Set()
    }

    // eslint-disable-next-line class-methods-use-this
    async attemptHandshakesOnContacts(excludedIds: string[]): Promise<string[]> {
        return excludedIds
    }

}
