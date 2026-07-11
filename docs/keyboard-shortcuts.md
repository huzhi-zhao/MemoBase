# 编辑器快捷键

首页编辑框（`MemoEditor`）基于 CodeMirror 6 实现，提供 Notion / Obsidian 风格的格式化快捷键。`Mod` 在 macOS 上是 `Cmd`，在 Windows / Linux 上是 `Ctrl`。

## 已支持
| 快捷键 | 功能 | 说明 |
| --- | --- | --- |
| `Mod-Enter` | 发布 / 保存 memo | 需要编辑器处于聚焦状态 |
| `Mod-B` | 加粗 `**text**` | 光标在加粗内容中时再次触发会取消加粗 |
| `Mod-I` | 斜体 `*text*` | 同上，支持切换 |
| `Mod-E` | 行内代码 `` `text` `` | 同上，支持切换 |
| `Mod-K` | 插入 / 移除链接 `[text](url)` | 光标已在链接内时会展开为纯文本；新建链接的 URL 需要手动补全（工具栏按钮目前也是这个行为，无 URL 输入弹层） |
| `Mod-Shift-7` | 有序列表 | 对选中的多行同时生效 |
| `Mod-Shift-8` | 无序列表 | 同上 |
| `Mod-Shift-9` | 任务列表 `- [ ]` | 同上 |
| `Mod-Alt-0` | 正文（取消标题） | |
| `Mod-Alt-1` / `Mod-Alt-2` / `Mod-Alt-3` | 一级 / 二级 / 三级标题 | 工具栏可寻址范围一致（H1–H3） |
| `Mod-Alt-4` / `Mod-Alt-5` | 四级 / 五级标题 | 仅快捷键支持，不接入命令目录（`EditorCommandId` 只到 heading3），因此工具栏和高亮态不会显示 H4/H5，但渲染与 markdown 输出均正常 |
| `Tab` / `Shift-Tab` | 列表项缩进 / 取消缩进 | 已有实现，非本次新增 |
| `Escape` | 编辑器失焦 | 已有实现，非本次新增 |
| `Mod-Z` / `Mod-Shift-Z` | 撤销 / 重做 | CodeMirror `historyKeymap` 自带 |

## 未支持（暂不实现）

以下 Notion / Obsidian 常见快捷键对应的格式在当前 markdown 命令目录（`formatting/commands.ts`）中还没有对应的切换逻辑，本次未添加，避免引入未经产品确认的新格式能力：

- 删除线（`~~text~~`）
- 下划线
- 高亮 / 标记（`==text==`）
- 引用块（`> `）
- 围栏代码块（```` ``` ````）

如需支持，需要先在 `formatting/commands.ts` 补充对应的 `EditorCommandId`、`ActiveFormatState` 字段，并在 `Editor/formatting.ts` 中实现对应的 toggle 逻辑（参考现有的 `toggleMark` / `toggleListLine`），再在 `createFormattingKeymap` 中追加按键绑定。

## 实现位置

- `web/src/components/MemoEditor/Editor/formatting.ts` — `applyCommand`（格式化命令的实际执行逻辑，供工具栏和快捷键共用）与 `createFormattingKeymap`（本次新增的按键绑定）。
- `web/src/components/MemoEditor/Editor/extensions.ts` — 将 `createFormattingKeymap()` 接入 CodeMirror 的 `keymap.of([...])`。
- `web/src/components/MemoEditor/hooks/useKeyboard.ts` — 编辑器级别的全局快捷键（目前只有 `Mod-Enter` 保存）。
- `web/src/components/MemoEditor/formatting/commands.ts` — 格式化命令目录，工具栏按钮与快捷键共用同一份命令定义。
