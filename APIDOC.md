<!-- note that this readme is embedded on API Documentation page within Streamr. Please don't use first-level headings (h1). -->
## Data Input via HTTP

You can write events to streams by POSTing JSON objects to the below API endpoint. The body of the request should be a JSON object, encoded in UTF-8, containing the key-value pairs representing your data. You can also send a JSON list (of objects), if you want to push multiple events in one HTTP request (they will all get the same timestamp).

### Endpoint

`https://www.streamr.com/api/v1/streams/:id/data`

Note that the stream id is part of the URL.

### Authentication

See the section on [authentication](#authentication).

### Options

Options for the data input can be provided in query parameters:

Parameter | Required | Description
--------- | -------- | -----------
ts        | no       | Event timestamp in either ISO 8601 string format or milliseconds since epoch. If not given, time on server will be used. Note: if you provide a timestamp, always send events in chronological order.
pkey      | no       | For partitioned streams, provides the key to partition by. Can be eg. a customer id to make all events for that customer to go to the same Canvas for processing. If not given, a random partition is selected.


Example request body (single object):

```json
{
	"foo": "hello",
	"bar": 24.5
}
```

Example request body (list of objects):

```json
[{
	"foo": "hello",
	"bar": 24.5
},
{
	"foo": "goodbye",
	"bar": 30
}]
```

### Usage Examples

Example using jquery:

```javascript
var msg = {
	foo: "hello",
	bar: 24.5
}

$.ajax({
	type: "POST",
	url: "https://www.streamr.com/api/v1/streams/MY-STREAM-ID/data",
    headers: {
        Authorization: "token MY-STREAM-AUTH-KEY"
    },
	data: JSON.stringify(msg)
});
```

Example using node.js + restler:

```javascript
var restler = require('restler');

var msg = {
	foo: "hello",
	bar: 24.5
}

restler.post('https://www.streamr.com/api/v1/streams/MY-STREAM-ID/data', {
    headers: {
        Authorization: "token MY-STREAM-AUTH-KEY"
    },
	data: JSON.stringify(msg)
})
```

Example using python + requests:

```python
import requests

msg = {
	'foo': 'hello',
	'bar': 24.5
}

requests.post('https://www.streamr.com/api/v1/streams/MY-STREAM-ID/data?auth=MY-STREAM-AUTH-KEY', json=msg, headers={'Authorization': 'token MY-STREAM-AUTH-KEY'})
```

Example using `curl`:

```
curl -i -X POST -H "Authorization: token MY-STREAM-AUTH-KEY" -d "{\"foo\":\"hello\",\"bar\":24.5}" https://www.streamr.com/api/v1/streams/MY-STREAM-ID/data
```

### Response Codes

code | description
---- | -----------
200  | Success (the response is empty)
400  | Invalid request
401  | Permission denied
403  | Authentication failed
404  | Stream not found
500  | Unexpected error
