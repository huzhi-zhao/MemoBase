# View Blocks — Complete Demo

A single copy‑paste playground exercising **every** documented syntax feature and
edge case of the four view blocks: `calendar`, `kanban`, `grid`, and `sheets`.
Each section first shows a full‑coverage example, then a few deliberately tricky
/ degenerate cases so you can see how the parser behaves at the edges.

> Interactions (drag, checkbox toggle, add task, cell editing) only work when you
> open **your own** document in an editable context. In the Explore feed or
> someone else's doc these render read‑only.

---

## 1. Calendar

Syntax (`web/src/components/MemoContent/calendar/parseCalendarBlock.ts`):

- A line `- YYYY-MM-DD` **opens a date group**.
- Following `- [ ] text` / `- [x] text` / `- text` lines attach to the current group.
  - `[ ]` → unchecked box, `[x]`/`[X]` → checked box, no box → plain text entry.
- Item lines **before any date** collect into an *Ungrouped* section shown above
  the month grid.
- Everything else (blank lines, prose) is ignored.

### 1.1 Full coverage

```calendar
- 项目还没排期的想法（未分组条目）
- [ ] 未分组的待办：整理灵感
- [x] 未分组的已完成项

- 2026-07-20
- [ ] Kick off sprint planning
- [x] Send calendar invites
- 全天：团队线下 offsite（纯文本，无 checkbox）

- 2026-07-21
- [ ] Draft the RFC
- [ ] Review PR #128
- [X] 大写 X 也算已完成

- 2026-07-25
- [ ] Ship release 1.4
- Retro notes 链接见 milestones/M-008.md
```

### 1.2 Edge cases

Multiple items on the same date across **non‑adjacent** groups still merge under
that date; an empty date group renders a day with zero items:

```calendar
- 2026-08-01
- [ ] First task on Aug 1

- 2026-08-03

- 2026-08-01
- [ ] Second task on Aug 1 (declared later, same date)
```

Fully empty body → friendly empty state (won't break the doc):

```calendar
```

---

## 2. Kanban

Syntax (`web/src/components/MemoContent/kanban/parseKanbanBlock.ts`). Body is
**YAML** with `items`, `view`, `statusOrder`.

- Item fields: `id`, **`title` (required)**, `link`, `status`, `priority`
  (`highest|high|medium|low|lowest`), `done`, `order`, `tags` (list or comma
  string), `due`, `createAt`/`updateAt`, plus any **custom field** (shown in the
  detail panel).
- `view`: `type`, `groupBy` (default `status`), `orderBy` (default `order`),
  `descending`, `lock`.
- `statusOrder`: explicit column order — listed columns render first (even empty
  ones); unlisted values append in first‑seen order; cards missing `groupBy`
  collect in a trailing **Ungrouped** column.

### 2.1 Full coverage

```kanban
items:
  - id: t1
    title: 调研 Spark Structured Streaming
    status: 需求
    priority: highest
    due: 2026-07-20
    tags: [BigData, 调研]
    order: 1
    owner: 赵华          # custom field → detail panel
    estimate: 3d         # custom field → detail panel
  - id: t2
    title: 内部文档链接示例
    link: milestones/M-008_SWM-EOI.md
    status: 需求
    priority: high
    order: 2
    tags: "文档, 内链"
  - id: t3
    title: 外部链接示例（新标签打开）
    link: https://spark.apache.org/docs/latest/
    status: 开发
    priority: medium
    createAt: 2026-07-10
  - id: t4
    title: 写单元测试
    status: 开发
    priority: low
    done: false
  - id: t5
    title: 联调与压测
    status: 测试
    priority: lowest
    due: 2026-07-28
  - id: t6
    title: 发布 1.4 到生产
    status: 发布
    done: true
    order: 1
  - id: t7
    title: 没有 status 的卡片 → Ungrouped 列

view:
  type: kanban
  groupBy: status
  orderBy: order
  descending: false
  lock: false

statusOrder: ['需求', '开发', '测试', '发布']
```

### 2.2 Group by a non‑status field

Grouping by `priority`. Note: drag‑to‑move and "Add task" are only available when
`groupBy` is `status`, so this board is effectively read‑only for column moves.

```kanban
items:
  - id: a
    title: 高优需求
    priority: high
    status: 需求
  - id: b
    title: 中优开发
    priority: medium
    status: 开发
  - id: c
    title: 低优优化
    priority: low
    status: 开发

view:
  groupBy: priority
  descending: true
```

### 2.3 Locked (frozen finished board)

```kanban
items:
  - id: done1
    title: 归档：Q2 复盘
    status: 完成
    done: true
view:
  groupBy: status
  lock: true
statusOrder: ['进行中', '完成']
```

### 2.4 Degenerate

Missing titles are skipped; invalid YAML degrades to an empty state:

```kanban
items:
  - id: nope
    status: 需求        # 无 title → 被跳过
  - title: 唯一有效卡片
    status: 开发
```

---

## 3. Grid

Syntax (`web/src/components/MemoContent/grid/parseGridBlock.ts`).

- Block config **before** the first `- ` line:
  - `style: card` (default) / `style: longbar` (alias `type: longbar`) — longbar
    = two‑line text strips, never showing a cover.
  - `nocover: true` — hide covers on every card.
  - `columns: N` — fixed column count, clamped 1–8 (default = auto‑fill by width).
- Each card starts with `- title: ...`. Known keys: `title` (required),
  `subtitle`, `cover`, `url`, `nocover` (per‑card).
- Any **other** indented `key: value` becomes an ordered display field under the
  subtitle (empty values dropped). Cover accepts an `attachments/...` resource
  name or a URL.

### 3.1 Full coverage — cover cards

```grid
columns: 3

- title: 带封面 + 链接的卡片
  subtitle: 副标题（muted）
  cover: https://picsum.photos/seed/one/400/300
  url: https://example.com
  作者: 赵华
  阅读时长: 8 分钟

- title: 使用附件作为封面
  subtitle: cover 指向工作区附件
  cover: attachments/cover-image.png
  标签: 设计

- title: 纯文本卡片（本卡禁用封面）
  subtitle: nocover 覆盖了封面设置
  cover: https://picsum.photos/seed/skip/400/300
  nocover: true
  备注: 即使配置了 cover 也不显示

- title: 无封面无副标题
  仅有字段: 也能正常渲染
```

### 3.2 Longbar style (two‑line strips, never shows covers)

```grid
style: longbar

- title: Yuque 式层级知识库
  subtitle: 目录树 + 富文档
- title: Notion 式视图
  subtitle: calendar / kanban / grid / sheets
- title: cover 在 longbar 下被忽略
  subtitle: 只显示标题 + 副标题
  cover: https://picsum.photos/seed/ignored/400/300
```

### 3.3 Block‑level `nocover` + fixed columns

```grid
nocover: true
columns: 2

- title: 卡片 A
  subtitle: 全局 nocover → 纯文本网格
  cover: https://picsum.photos/seed/a/400/300
- title: 卡片 B
  subtitle: 两列布局
```

---

## 4. Sheets

Syntax (`web/src/components/MemoContent/sheets/parseSheetsBlock.ts`). CSV‑based.

- `sheet:<name>` starts a named tab (multiple → multiple tabs; no marker → one
  unnamed sheet).
- CSV rows parsed with papaparse; first row is the header. A cell starting with
  `=` is a **formula**.
- `view:` section: `lock: true|false`. Height is set by dragging the grid's
  bottom handle and is persisted per block (node overlays), not in the source.

**Formulas that work:** built‑ins `SUM AVERAGE MAX MIN IF AND OR CONCAT`, plus
fallbacks `PRODUCT DIVIDE SUBTRACT COUNT COUNTA ABS INT SQRT ROUND LEN` …, and
plain arithmetic on individual cells (`=B2*C2+B3*C3`). **Range/array math does
NOT work** (`=SUMPRODUCT(...)`, `=SUM(B2:B3*C2:C3)`); unknown functions →
`#N/A` (safe, no crash).

### 4.1 Full coverage — multiple sheets + formulas

```sheets
sheet:销售数据
name,price,qty,subtotal
苹果,3.5,10,=B2*C2
香蕉,2.1,20,=B3*C3
橙子,4.0,15,=B4*C4
,,,合计,=SUM(D2:D4)
,,,均价,=AVERAGE(B2:B4)
,,,最高价,=MAX(B2:B4)
,,,笔数,=COUNT(B2:B4)

sheet:公式演示
表达式,结果
逐格相乘再求和,=B2*1
SUM,=SUM(1,2,3)
IF 判断,=IF(1>0,"正","负")
CONCAT,=CONCAT("Hello"," ","World")
ROUND,=ROUND(3.14159,2)
SQRT,=SQRT(16)
LEN,=LEN("memos")
未支持函数(→#N/A),=VLOOKUP(1,A1,1)

view:
  lock: false
```

### 4.2 Range arithmetic pitfall (documented as NOT working)

Use explicit expansion `=B2*C2+B3*C3` instead of `SUMPRODUCT`:

```sheets
sheet:陷阱演示
price,qty
3.5,10
2.1,20
正确总价(展开),=A2*B2+A3*B3
错误示范(SUMPRODUCT),=SUMPRODUCT(A2:A3,B2:B3)
```

### 4.3 Single unnamed sheet, locked & read‑only

```sheets
项目,状态,负责人
知识库,进行中,赵华
视图系统,已完成,团队

view:
  lock: true
```

---

## Quick reference

| Block | Trigger fence | Body format | Write‑back | Key limits |
|-------|---------------|-------------|-----------|-----------|
| Calendar | ` ```calendar ` | `- DATE` + `- [ ] item` lines | checkbox toggle, add items | dates must be `YYYY-MM-DD` |
| Kanban | ` ```kanban ` | YAML (`items`/`view`/`statusOrder`) | checkbox, drag, add task | drag/add only when `groupBy: status` |
| Grid | ` ```grid ` | `key: value` config + `- title:` cards | none (display only) | cover = attachment/URL; `columns` 1–8 |
| Sheets | ` ```sheets ` | `sheet:` + CSV + `view:` | cell edits (debounced) | 8 built‑in fns + fallbacks; no range math |
