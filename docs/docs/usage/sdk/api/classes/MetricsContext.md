# Class: MetricsContext

## Constructors

### new MetricsContext()

> **new MetricsContext**(): [`MetricsContext`](MetricsContext.md)

#### Returns

[`MetricsContext`](MetricsContext.md)

## Methods

### addMetrics()

> **addMetrics**(`namespace`, `definitions`): `void`

#### Parameters

• **namespace**: `string`

• **definitions**: [`MetricsDefinition`](../api.md#metricsdefinition)

#### Returns

`void`

***

### createReportProducer()

> **createReportProducer**(`onReport`, `interval`, `abortSignal`, `formatNumber`?): `void`

#### Parameters

• **onReport**

• **interval**: `number`

• **abortSignal**: `AbortSignal`

• **formatNumber?**

#### Returns

`void`

***

### getMetric()

> **getMetric**(`id`): `undefined` \| [`Metric`](Metric.md)

#### Parameters

• **id**: `string`

#### Returns

`undefined` \| [`Metric`](Metric.md)
