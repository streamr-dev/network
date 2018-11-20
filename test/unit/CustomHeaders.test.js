const { CustomHeaders } = require('../../src/connection/WsEndpoint')

test('empty custom headers works', () => {
    const emptyHeaders = new CustomHeaders({})

    expect(emptyHeaders.asObject()).toEqual({})
    expect(emptyHeaders.asArray()).toEqual([])
    expect(emptyHeaders.pluckCustomHeadersFromObject({
        Authorization: 'hello world'
    })).toEqual({})
})

test('custom headers work', () => {
    const headers = new CustomHeaders({
        'StreaMR-Peer-Id': 'my-ID',
        foo: 'bar'
    })

    expect(headers.asObject()).toEqual({
        'streamr-peer-id': 'my-ID',
        foo: 'bar'
    })
    expect(headers.asArray()).toEqual([
        'streamr-peer-id: my-ID',
        'foo: bar'
    ])
    expect(headers.pluckCustomHeadersFromObject({
        'STREAMR-PEER-ID': 'other-ID',
        somethingCompletelyDifferent: 'shouldNotAppear',
    })).toEqual({
        'streamr-peer-id': 'other-ID'
    })
})
