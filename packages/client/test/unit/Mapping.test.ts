import { Mapping } from '../../src/utils/Mapping'

describe('Mapping', () => {

    it('create', async () => {
        const mapping = new Mapping(async (p1: string, p2: number) => `${p1}${p2}`)
        expect(await mapping.get('foo', 1)).toBe('foo1')
        expect(await mapping.get('bar', 2)).toBe('bar2')
    })

    it('memorize', async () => {
        let evaluationIndex = 0
        const mapping = new Mapping(async (_p: string) => {
            const result = evaluationIndex
            // eslint-disable-next-line no-plusplus
            evaluationIndex++
            return result
        })
        expect(await mapping.get('foo')).toBe(0)
        expect(await mapping.get('foo')).toBe(0)
        expect(await mapping.get('bar')).toBe(1)
        expect(await mapping.get('bar')).toBe(1)
        expect(await mapping.get('foo')).toBe(0)
    })

    it('undefined', async () => {
        const valueFactory = jest.fn().mockResolvedValue(undefined)
        const mapping = new Mapping(valueFactory)
        expect(await mapping.get('foo')).toBe(undefined)
        expect(await mapping.get('foo')).toBe(undefined)
        expect(valueFactory).toBeCalledTimes(1)
    })

})
