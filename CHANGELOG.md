# [Unreleased](https://github.com/streamr-dev/streamr-client/compare/v5.3.0-beta.0...c98b04415cdf558b483f70a838e58b2a5321ffed) (2021-05-01)

### Bug Fixes

* Don't use waitForCondition outside test, doesn't wait for async, uses browser-incompatible setImmediate. ([c98b044](https://github.com/streamr-dev/streamr-client/commit/c98b04415cdf558b483f70a838e58b2a5321ffed))
* **login:** Remove apiKey login support, no longer supported by core-api. ([f37bac5](https://github.com/streamr-dev/streamr-client/commit/f37bac53972ed9dc429ffdbd1567172d6e502801))

### Features

* Don't clear message chains on disconnect, allows continued publishing to same chain. ([df64089](https://github.com/streamr-dev/streamr-client/commit/df6408985d0001a88d118d9712c2cc92f595748d))


## [5.2.1](https://github.com/streamr-dev/streamr-client/compare/v5.1.0...v5.2.1) (2021-03-29)

This release fixes a subtle but serious memleak in all previous 5.x
versions. Upgrading immediately is highly recommended.

### Bug Fixes

* **dataunions:** Withdraw amount can be a string ([bccebcb](https://github.com/streamr-dev/streamr-client/commit/bccebcb580e91f55a68a0aae864dcc48cf370bfa))
* **keyexchange:** Remove bad call to cancelTask. ([cb576fd](https://github.com/streamr-dev/streamr-client/commit/cb576fdccbbf2600011c89a151cb15a3870a258a))
* **pipeline:** Fix memleak in pipeline. ([86fcb83](https://github.com/streamr-dev/streamr-client/commit/86fcb833d74df267ad538fc37cf76c4f95c9462c))
* **pushqueue:** Empty pending promises array in cleanup, prevents memleak. ([1e4892c](https://github.com/streamr-dev/streamr-client/commit/1e4892ccabd6853c59648fc025bc8be1fd630e55))
* **pushqueue:** Transform was doing something unusual. ([27dbb05](https://github.com/streamr-dev/streamr-client/commit/27dbb05612a2d838e4ce399fb643d6ca00c1af74))
* **subscribe:** Clean up type errors. ([1841741](https://github.com/streamr-dev/streamr-client/commit/184174127835a3d11160acbe4804b621e4480a86))
* **util:** Clean up dangling Defers in LimitAsyncFnByKey. ([1eaa55a](https://github.com/streamr-dev/streamr-client/commit/1eaa55a9b51f44e055148ba80fa51e1d63fe2a77))
* **util/defer:** Rejig exposed functions so resolve/reject can be gc'ed. ([2638f2b](https://github.com/streamr-dev/streamr-client/commit/2638f2b164455b6c45f3c6e9d3d6b297669ebc7a))
* **validator:** Only keep a small message validator cache. ([de7b689](https://github.com/streamr-dev/streamr-client/commit/de7b68953dd52f8fbdf4bee4dff2ba6b3bd02545))
