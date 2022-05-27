
## Develop

The information here is mostly for the Streamr team and others intending to contribute to the codebase.

When developing the Broker, it is convenient to run it as part of the full Streamr development stack. Check out
the [streamr-docker-dev](https://github.com/streamr-dev/streamr-docker-dev) tool that can be used to run the full stack.

If instead you want to run a broker node by itself without Docker, follow the steps in the [Run](#run) section.

See folder "configs" for example configurations. To run a broker connected to the local dev environment:
```
streamr-broker configs/development-1.env.json
```
Then run the command tracker with default values
```
tracker
```

To run tests, first install dependencies:

    npm ci

Run the tests:

    npm run test

We use [eslint](https://github.com/eslint/eslint) for code formatting:

    npm run eslint

### Debug

To get all debug messages:

    LOG_LEVEL=debug

... or adjust debugging to desired level:

    LOG_LEVEL=[debug|info|warn|error]

To disable all logs

    NOLOG=true


## Release

For release instructions, see the [monorepo root readme](https://github.com/streamr-dev/network-monorepo/).

## Misc dev notes

### Regenerate self-signed certificate fixture
To regenerate self-signed certificate in `./test/fixtures` run:

```bash
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 36500 -nodes -subj "/CN=localhost"
```

### Deleting expired data from Storage node
To delete expired data from storage node run

```
npm run delete-expired-data
```
