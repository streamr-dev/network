import { Stream } from '../../src/stream'
import { validateOptions } from '../../src/stream/utils'

describe('Stream utils', () => {

    it('no definition', () => {
        expect(() => validateOptions(undefined as any)).toThrow()
        expect(() => validateOptions(null as any)).toThrow()
        expect(() => validateOptions({})).toThrow()
    })

    it('string', () => {
        expect(validateOptions('foo')).toMatchObject({
            streamId: 'foo',
            streamPartition: 0,
            key: 'foo::0'
        })
    })

    it('object', () => {
        expect(validateOptions({ streamId: 'foo' })).toMatchObject({
            streamId: 'foo',
            streamPartition: 0,
            key: 'foo::0'
        })
        expect(validateOptions({ streamId: 'foo', streamPartition: 123 })).toMatchObject({
            streamId: 'foo',
            streamPartition: 123,
            key: 'foo::123'
        })
        expect(validateOptions({ id: 'foo', partition: 123 })).toMatchObject({
            streamId: 'foo',
            streamPartition: 123,
            key: 'foo::123'
        })
    })

    it('stream', () => {
        const stream = new Stream(undefined as any, {
            id: 'foo',
            name: 'bar'
        })
        expect(validateOptions({ stream })).toMatchObject({
            streamId: 'foo',
            streamPartition: 0,
            key: 'foo::0'
        })
    })

})
