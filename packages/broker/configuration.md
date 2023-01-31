# Configuration

See [config.schema.json](src/config/config.schema.json).

### Environment variables

You may use environment variables to override any configuration option read from the configuration file. This is not the recommended way to change these values. It is better to modify the actual configuration file.

The syntax of the variables names is like this:
```
STREAMR__BROKER__PLUGINS__BRUBECK_MINER__BENEFICIARY_ADDRESS
```

The names start with `STREAMR__BROKER__` and each configuration block is separated by double underscore. Blocks and properties are defined in *CONSTANT_CASE* instead of *camelCase*.

It is possible to defined arrays by adding a numeration suffix to a block/property:
```
STREAMR__BROKER__CLIENT__NETWORK__TRACKERS_1__ID = 'foo'
STREAMR__BROKER__AUTHENTICATION__KEYS_1 = 'bar'
```

Note that the first item of an array has index `1` (not `0`).