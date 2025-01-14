import EventEmitter from 'eventemitter3'
import {
    AutoCertifierClientFacade,
    IAutoCertifierClient
} from '../../src/connection/websocket/AutoCertifierClientFacade'
import { MockTransport } from '../utils/mock/MockTransport'

class MockAutoCertifierClient extends EventEmitter {
    start = async () => {
        this.emit('updatedCertificate', {})
    }
    // eslint-disable-next-line class-methods-use-this
    stop = () => {}
    emitUpdateSubdomain = () => {
        this.emit('updatedCertificate', {})
    }
}

describe('AutoCertifierClientFacade', () => {
    let client: AutoCertifierClientFacade
    let mockClient: IAutoCertifierClient
    let setHost: jest.Mock
    let updateCertificate: jest.Mock

    beforeEach(() => {
        mockClient = new MockAutoCertifierClient()
        const mockClientFactory = (): IAutoCertifierClient => mockClient
        setHost = jest.fn()
        updateCertificate = jest.fn()
        client = new AutoCertifierClientFacade({
            url: '',
            configFile: '',
            transport: new MockTransport(),
            wsServerPort: 0,
            setHost,
            updateCertificate,
            createClientFactory: mockClientFactory
        })
    })

    afterEach(() => {
        client.stop()
    })

    it('start', async () => {
        await client.start()
        expect(setHost).toHaveBeenCalled()
        expect(updateCertificate).toHaveBeenCalled()
    })

    it('updated events are processed', async () => {
        await client.start()
        expect(setHost).toHaveBeenCalledTimes(1)
        expect(updateCertificate).toHaveBeenCalledTimes(1)
        ;(mockClient as MockAutoCertifierClient).emitUpdateSubdomain()
        expect(setHost).toHaveBeenCalledTimes(2)
        expect(updateCertificate).toHaveBeenCalledTimes(2)
    })
})
