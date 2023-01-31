# Configuration

See [config.schema.json](src/config/config.schema.json).

### Environment variables

You may use environment variables to define any configuration option. This is not the recommended way to use configuration: it is better to modify the actual configuration file, is possible.

E.g. if you want to set a private key, you can define a variable like this:
```
STREAMR__BROKER__CLIENT__AUTH__PRIVATE_KEY = '0x1234'
````

It corresponds to this configuration file:
```
{
    "client": {
        "auth": {
            "privateKey": "0x1234"
        }
    },
    ...
}
```

All environment variable names start with `STREAMR__BROKER__` and each configuration block is separated by double underscore. Blocks and properties are defined in *CONSTANT_CASE* instead of *camelCase*.

If the value is defined both in an environment variable and the configuration file, the environment variable value is used.

It is possible to defined arrays by adding a numeration suffix to a block/property:
```
STREAMR__BROKER__CLIENT__NETWORK__TRACKERS_1__ID = '0x1234'
STREAMR__BROKER__CLIENT__NETWORK__TRACKERS_2__ID = '0x5678'
STREAMR__BROKER__AUTHENTICATION__KEYS_1 = 'foo'
STREAMR__BROKER__AUTHENTICATION__KEYS_2 = 'bar'
```

Note that the first item of an array has index `1` (not `0`).