import { detectFields } from '../../src/StreamField'

describe('detect stream fields', () => {
    it('does detect primitive types', async () => {
        const msg = {
            number: 123,
            boolean: true,
            object: {
                k: 1,
                v: 2,
            },
            array: [1, 2, 3],
            string: 'test',
        }
        const actualFields = detectFields(msg)

        const expectedFields = [
            {
                name: 'number',
                type: 'number',
            },
            {
                name: 'boolean',
                type: 'boolean',
            },
            {
                name: 'object',
                type: 'map',
            },
            {
                name: 'array',
                type: 'list',
            },
            {
                name: 'string',
                type: 'string',
            },
        ]
        expect(actualFields).toEqual(expectedFields)
    })

    it('skips unsupported types', async () => {
        const msg = {
            null: null,
            empty: {},
            func: () => null,
            nonexistent: undefined,
            symbol: Symbol('test'),
            // TODO: bigint: 10n,
        }
        const actualFields = detectFields(msg)

        const expectedFields = [
            {
                name: 'null',
                type: 'map',
            },
            {
                name: 'empty',
                type: 'map',
            },
        ]
        expect(actualFields).toEqual(expectedFields)
    })
})
