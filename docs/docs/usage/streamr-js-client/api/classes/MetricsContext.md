---
id: "MetricsContext"
title: "Class: MetricsContext"
sidebar_label: "MetricsContext"
sidebar_position: 0
custom_edit_url: null
---

## Constructors

### constructor

• **new MetricsContext**()

## Methods

### addMetrics

▸ **addMetrics**(`namespace`, `definitions`): `void`

#### Parameters

| Name | Type |
| :------ | :------ |
| `namespace` | `string` |
| `definitions` | [`MetricsDefinition`](../index.md#metricsdefinition) |

#### Returns

`void`

___

### createReportProducer

▸ **createReportProducer**(`onReport`, `interval`, `abortSignal`, `formatNumber?`): `void`

#### Parameters

| Name | Type |
| :------ | :------ |
| `onReport` | (`report`: [`MetricsReport`](../index.md#metricsreport)) => `void` |
| `interval` | `number` |
| `abortSignal` | `AbortSignal` |
| `formatNumber?` | (`value`: `number`) => `string` |

#### Returns

`void`

___

### getMetric

▸ **getMetric**(`id`): `undefined` \| [`Metric`](Metric.md)

#### Parameters

| Name | Type |
| :------ | :------ |
| `id` | `string` |

#### Returns

`undefined` \| [`Metric`](Metric.md)
