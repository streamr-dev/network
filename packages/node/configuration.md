# Configuration

See [config.schema.json](src/config/config.schema.json).

### Environment variables

You may use environment variables to define any configuration option. This is not the recommended way to use configuration: it is better to modify the actual configuration file, is possible.

E.g. if you want to set the private key, you can define a variable like this:
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

If the value is defined both in an environment variable and a configuration file, the environment variable value is used.

It is possible to define arrays by adding a numeration suffix to a block/property:
```
STREAMR__BROKER__CLIENT__NETWORK__TRACKERS_1__ID = '0x1234'
STREAMR__BROKER__CLIENT__NETWORK__TRACKERS_2__ID = '0x5678'
STREAMR__BROKER__AUTHENTICATION__KEYS_1 = 'foo'
STREAMR__BROKER__AUTHENTICATION__KEYS_2 = 'bar'
```

Note that the first item of an array has index `1` (not `0`).

### Configuring plugins via environment variables

Plugins can also be configured using environment variables in the same way. The general pattern is:
```
STREAMR__BROKER__PLUGINS__<PLUGIN_NAME>__<PROPERTY_NAME> = 'value'
```

For example, to configure the autostaker plugin:
```
STREAMR__BROKER__PLUGINS__AUTOSTAKER__OPERATOR_CONTRACT_ADDRESS = '0x1234567890abcdef1234567890abcdef12345678'
STREAMR__BROKER__PLUGINS__AUTOSTAKER__MAX_SPONSORSHIP_COUNT = '25'
STREAMR__BROKER__PLUGINS__AUTOSTAKER__MIN_TRANSACTION_DATA_TOKEN_AMOUNT = '1000'
STREAMR__BROKER__PLUGINS__AUTOSTAKER__MAX_ACCEPTABLE_MIN_OPERATOR_COUNT = '50'
STREAMR__BROKER__PLUGINS__AUTOSTAKER__RUN_INTERVAL_IN_MS = '3600000'
```

This corresponds to the following configuration file:
```json
{
    "plugins": {
        "autostaker": {
            "operatorContractAddress": "0x1234567890abcdef1234567890abcdef12345678",
            "maxSponsorshipCount": 25,
            "minTransactionDataTokenAmount": 1000,
            "maxAcceptableMinOperatorCount": 50,
            "runIntervalInMs": 3600000
        }
    }
}
```

You can also configure nested objects within plugins:
```
STREAMR__BROKER__PLUGINS__AUTOSTAKER__FLEET_STATE__HEARTBEAT_UPDATE_INTERVAL_IN_MS = '10000'
STREAMR__BROKER__PLUGINS__AUTOSTAKER__FLEET_STATE__PRUNE_AGE_IN_MS = '180000'
STREAMR__BROKER__PLUGINS__AUTOSTAKER__FLEET_STATE__PRUNE_INTERVAL_IN_MS = '30000'
```

Which corresponds to:
```json
{
    "plugins": {
        "autostaker": {
            "fleetState": {
                "heartbeatUpdateIntervalInMs": 10000,
                "pruneAgeInMs": 180000,
                "pruneIntervalInMs": 30000
            }
        }
    }
}
```