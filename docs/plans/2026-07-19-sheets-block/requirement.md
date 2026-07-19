# sheets 代码块（可编辑表格）

## 需求概述

在任意 memo/文档正文中写一个语言标签为 `sheets` 的 fenced code block，预览时渲染成一个**可直接编辑的表格网格**（基于 [x-data-spreadsheet](https://github.com/myliang/x-spreadsheet)），编辑结果自动写回文档。与 [calendar 代码块](../2026-07-12-calendar-callout/requirement.md) 同一条技术路线：只在单篇文档内部、渲染层面做文章，不引入新文档类型。

块内语法为「`sheet:名称` 分节 + CSV 正文 + 可选 `view:` 配置节」，解析实现见 [parseSheetsBlock.ts](../../../web/src/components/MemoContent/sheets/parseSheetsBlock.ts)。支持多 sheet、`lock: true` 只读、以及右键菜单里的 **AI 公式生成**（自然语言 → 公式，服务端 `GenerateFormula` 生成并校验后返回，见 [ai_service.go](../../../server/router/api/v1/ai_service.go)）。

## 数据落点：正文 CSV + node_overlays 样式覆盖

表格的**文本内容**序列化回 markdown 正文（CSV），而**样式类信息**（单元格样式、网格视口高度、当前打开的 sheet 标签）不进正文，改为存进 memo 的 `node_overlays` map，以块的 `id:` 为 key，value 是渲染器自有格式的不透明 JSON（服务端不解析）。这样表格源码保持人类可读的纯 CSV，样式又不会污染正文 diff。`id` 在首次需要持久化样式时惰性生成，纯数据表格永远不会获得 id。

## 已知隐患：并发写入下的覆盖丢失

`node_overlays` 在 API 层是**整个 map 替换**语义（`UpdateMemo` 的 `node_overlays` mask，见 [memo_service.go](../../../server/router/api/v1/memo_service.go)），而前端 [SheetsBlock.tsx](../../../web/src/components/MemoContent/SheetsBlock.tsx) 的 `commitFromInstance` 是基于自己手里那份 `memo` 快照构造新 map 再整体提交的。由此产生两个覆盖窗口（提交有 600ms debounce，窗口是真实存在的）：

1. **同一文档内多个 sheets 块互相覆盖 overlay**：A 块和 B 块在同一 debounce 窗口内各自提交，后到的那次请求携带的 map 是基于「B 提交前的快照」构造的，会把 A 刚写进去的 overlay 抹掉。
2. **表格提交覆盖正文改动**：`commitFromInstance` 用 `memoRef.current.content` 做 `writeSheetsBlock` 再整体提交 content。如果用户在同一窗口内于编辑器改了正文其他部分，表格这次提交会把那部分改动回滚。

当前是**已知可接受**：单人、低频编辑场景下窗口极窄，且丢失的是样式/最近一次编辑而非整篇文档。

若要根治，方向是把服务端的 `node_overlays` 从整表替换改为 **per-key merge**（只更新 mask 里指定的那些 key，其余保持不变），正文侧则需要引入 version/etag 之类的乐观并发校验，让基于陈旧快照的写入失败重试而不是静默覆盖。这两项都超出当前迭代范围，留待多人协作编辑时一并处理。
