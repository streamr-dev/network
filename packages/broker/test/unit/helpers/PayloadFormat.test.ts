import { MetadataPayloadFormat, PlainPayloadFormat } from '../../../src/helpers/PayloadFormat'

const MOCK_OBJECT = {
    foo: 'bar'
}
const MOCK_ARRAY = [
    'foo',
    'bar'
]
const MOCK_METADATA = {
    timestamp: 123,
    sequenceNumber: 456,
    publisherId: 'p',
    msgChainId: 'm'
}

describe('PayloadFormat', () => {

    describe('plain', () => {

        const format = new PlainPayloadFormat()

        describe('createMessage', () => {

            it('object', () => {
                expect(format.createMessage(JSON.stringify(MOCK_OBJECT))).toEqual({
                    content: MOCK_OBJECT,
                    metadata: {}
                })
            })

            it('array', () => {
                expect(format.createMessage(JSON.stringify(MOCK_ARRAY))).toEqual({
                    content: MOCK_ARRAY,
                    metadata: {}
                })
            })

            it.each([
                ['foobar'],
                [undefined]
            ])('invalid: %p', (payload: any) => {
                expect(() => format.createMessage(payload)).toThrow()
            })

        })

        describe('createPayload', () => {

            it('object', () => {
                expect(JSON.parse(format.createPayload(MOCK_OBJECT))).toEqual(MOCK_OBJECT)
            })

            it('array', () => {
                expect(JSON.parse(format.createPayload(MOCK_ARRAY))).toEqual(MOCK_ARRAY)
            })

            it.each([
                ['foobar'],
                [undefined]
            ])('invalid: %p', (content: any) => {
                expect(() => format.createPayload(content)).toThrow()
            })

        })

    })

    describe('metadata', () => {

        const format = new MetadataPayloadFormat()

        describe('createMessage', () => {

            it('object', () => {
                expect(format.createMessage(JSON.stringify({
                    content: MOCK_OBJECT,
                    metadata: MOCK_METADATA
                }))).toEqual({
                    content: MOCK_OBJECT,
                    metadata: MOCK_METADATA
                })
            })

            it('array', () => {
                expect(format.createMessage(JSON.stringify({
                    content: MOCK_ARRAY,
                    metadata: MOCK_METADATA
                }))).toEqual({
                    content: MOCK_ARRAY,
                    metadata: MOCK_METADATA
                })
            })

            it.each([
                ['foobar'],
                [undefined],
                [JSON.stringify({ content: 'foobar' })],
                [JSON.stringify({ content: undefined })],
                [JSON.stringify({ content: {}, metadata: 'foobar' })]
            ])('invalid: %p', (payload: any) => {
                expect(() => format.createMessage(payload)).toThrow()
            })

        })

        describe('createPayload', () => {

            it('object', () => {
                expect(JSON.parse(format.createPayload(MOCK_OBJECT, MOCK_METADATA))).toEqual({
                    content: MOCK_OBJECT,
                    metadata: MOCK_METADATA
                })
            })

            it('array', () => {
                expect(JSON.parse(format.createPayload(MOCK_ARRAY, MOCK_METADATA))).toEqual({
                    content: MOCK_ARRAY,
                    metadata: MOCK_METADATA
                })
            })

            it.each([
                ['foobar', {}],
                [undefined, {}],
                [{}, 'foobar']
            ])('invalid: %p %p', (content: any, metadata: any) => {
                expect(() => format.createPayload(content, metadata)).toThrow()
            })

        })

    })
})