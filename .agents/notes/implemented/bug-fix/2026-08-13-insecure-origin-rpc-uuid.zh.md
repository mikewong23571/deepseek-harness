# Agent Note: 非安全 origin 上的浏览器 RPC UUID

Status: implemented

[English](2026-08-13-insecure-origin-rpc-uuid.md) | 中文

## 问题

Web 客户端会在每次一元 RPC 前调用 `crypto.randomUUID()`。浏览器只在 secure context 中提供该操作，因此绑定到私有覆盖网络地址的纯 HTTP 部署会在发送 `host.describe`、`llm.providers` 或 `settings.describe` 之前失败。模型提供方页面把故障显示为 `crypto.randomUUID is not a function`，连接初始化则只能不断重试同一个本地异常。

## 决策

`AbstractApiClient.mintRpcId()` 使用 `crypto.getRandomValues()` 构造 RFC 4122 版本 4 标识符。它明确设置版本位和变体位，并继续把 rpcId 签发留在载体层。浏览器在非安全 origin 上也提供 `getRandomValues()`，Node 和安全浏览器 origin 同样提供该 API。

## 曾考虑的替代方案

**要求所有远程 Web 部署都使用 HTTPS。** 拒绝，因为传输安全仍属于部署职责，而载体生成关联 id 并不需要依赖仅 secure context 可用的能力。

**仅在缺少 `randomUUID` 时回退。** 拒绝，因为两套实现需要等价覆盖，却不会改善标识符约定；`getRandomValues()` 可以直接满足所有受支持环境。

**导入 client connection 包中的 UUID helper。** 拒绝，因为 API 载体不能反向依赖浏览器组合消费方。如果第三个所有者也需要该算法，未来可以提升为共享 utility。

## 后果

一元 RPC 可以在私有纯 HTTP origin 上工作，且不会削弱随机性或改变 wire 格式。一项确定性载体测试移除 `randomUUID`、提供 `getRandomValues()`，并固定 RFC 版本位和变体位。本变更不会增加 TLS 或认证；非回环部署仍依赖其配置的网络和浏览器 Host 信任策略。
