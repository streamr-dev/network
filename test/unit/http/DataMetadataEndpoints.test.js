const express = require('express')
const request = require('supertest')

const dataMetadataEndpoint = require('../../../src/http/DataMetadataEndpoints')

describe('DataMetadataEndpoints', () => {
    let app

    function testGetRequest(url, sessionToken = 'mock-session-token') {
        return request(app)
            .get(url)
            .set('Accept', 'application/json')
            .set('Authorization', `Bearer ${sessionToken}`)
    }

    it('should fail testGetRequest on uninitialized Cassandra broker', async () => {
        app = express()
        app.use('/api/v1', dataMetadataEndpoint())

        await testGetRequest('/api/v1/streams/0/metadata/partitions/0')
            .expect(501)
    })
})
