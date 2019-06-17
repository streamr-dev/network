# Broker

## Building
Project uses npm for package management.

- Start off by installing required dependencies with `npm install`
- To run tests `npm test`

## Running
`npm run`

## Publishing
Not yet.    

## API Specification

For production version refer to https://www.streamr.com/help/api#datainput and https://www.streamr.com/help/api#dataoutput.

Otherwise see [APIDOC.md](APIDOC.md).

## Protocol Specification

Internal messaging protocol is described in [PROTOCOL.md](PROTOCOL.md).

## MQTT publishing

- For authentication put API_KEY in password connection field
- MQTT native clients are able to send plain text, but their payload will be transformed to JSON
`{"mqttPayload":"ORIGINAL_PLAINTEXT_PAYLOAD}`

Error handling:
- If API_KEY is not correct, client will receive "Connection refused, bad user name or password" (returnCode: 4)
- If stream is not found, client will receive "Connection refused, not authorized" (returnCode: 5)


## License

This software is open source, and dual licensed under [AGPLv3](https://www.gnu.org/licenses/agpl.html) and an enterprise-friendly commercial license.
