import { randomUserId } from '@streamr/test-utils'
import { MetadataPayloadFormat, PlainPayloadFormat } from '../../../src/helpers/PayloadFormat'

const MOCK_CONTENT = {
    foo: 'bar'
}
const MOCK_METADATA = {
    timestamp: 123,
    sequenceNumber: 456,
    publisherId: randomUserId(),
    msgChainId: 'm'
}

describe('PayloadFormat', () => {
    describe('plain', () => {
        const format = new PlainPayloadFormat()

        describe('createMessage', () => {
            it('happy path', () => {
                expect(format.createMessage(JSON.stringify(MOCK_CONTENT))).toEqual({
                    content: MOCK_CONTENT,
                    metadata: {}
                })
            })

            it.each([[''], ['foobar'], [undefined], [[]]])('invalid: %p', (payload: any) => {
                expect(() => format.createMessage(payload)).toThrow()
            })
        })

        describe('createPayload', () => {
            it('happy path', () => {
                expect(JSON.parse(format.createPayload(MOCK_CONTENT))).toEqual(MOCK_CONTENT)
            })

            it.each([[''], ['foobar'], [undefined], [[]]])('invalid: %p', (content: any) => {
                expect(() => format.createPayload(content)).toThrow()
            })
        })
    })

    describe('metadata', () => {
        const format = new MetadataPayloadFormat()

        describe('createMessage', () => {
            it('happy path', () => {
                expect(
                    format.createMessage(
                        JSON.stringify({
                            content: MOCK_CONTENT,
                            metadata: MOCK_METADATA
                        })
                    )
                ).toEqual({
                    content: MOCK_CONTENT,
                    metadata: MOCK_METADATA
                })
            })

            it.each([
                [''],
                ['foobar'],
                [undefined],
                [JSON.stringify({ content: 'foobar' })],
                [JSON.stringify({ content: undefined })],
                [JSON.stringify({ content: [] })],
                [JSON.stringify({ content: {}, metadata: 'foobar' })]
            ])('invalid: %p', (payload: any) => {
                expect(() => format.createMessage(payload)).toThrow()
            })
        })

        describe('createPayload', () => {
            it('happy path', () => {
                expect(JSON.parse(format.createPayload(MOCK_CONTENT, MOCK_METADATA))).toEqual({
                    content: MOCK_CONTENT,
                    metadata: MOCK_METADATA
                })
            })

            it.each([
                ['', {}],
                ['foobar', {}],
                [undefined, {}],
                [[], {}],
                [{}, ''],
                [{}, 'foobar'],
                [{}, []]
            ])('invalid: %p %p', (content: any, metadata: any) => {
                expect(() => format.createPayload(content, metadata)).toThrow()
            })
        })
    })
})
