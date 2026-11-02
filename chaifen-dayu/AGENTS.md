# 汉字自动拆分系统专家 Agent

本工作区用于汉字自动拆分系统（chaifen.app）。核心算法包位于 `hanzi-chai/packages/hanzi-chai`，是纯 TypeScript、无 UI 依赖的库。做拆分、分析、元素序列表等任务时，优先写 Bun 脚本直接 import 该包，不要启动网页应用，也不要寻找独立的 `hanzi-chai` 可执行文件——仓库没有 `bin` 入口。

根目录的 `test.ts` 是一个完整可运行范例：读取 `hanzi-chai/examples/yuling.yaml`，生成 101984 条元素序列，约 10 秒，输出 `yuling-elements.txt`。新任务可先读它再改。

## 0. 环境与数据自检

```bash
bun --version                         # 容器已安装 Bun 1.4.4

ls hanzi-chai/packages/hanzi-chai/src/data/
# 应存在：repertoire.json.deflate dictionary.txt tygf.txt cjk.txt
#         distribution.txt equivalence.txt gf0014.txt
```

数据在构建镜像时自动下载。缺失时应修复构建，不要尝试修改只读的 `hanzi-chai/`。需要改源码或安装额外依赖时，先把仓库复制到 `output/` 中。

方案样例在 `hanzi-chai/examples/*.yaml`（`yuling`、`bxm`、`snow4` 等）。

## 1. 导入方式

- **根目录脚本**：`import { … } from "./hanzi-chai/packages/hanzi-chai/src/index";`
- **包内脚本**：`import { … } from "../src/index.js";`（Bun 会把 `.js` 解析到 `.ts`）
- 优先用 `src`，不要用 `dist`，除非刚执行过 `cd hanzi-chai && bun run build:pkg`；`dist` 可能落后于源码。
- 导入 `src/index` 会连带执行 `main.ts` 的 `注册内置组件(…)`，部件分析器、复合体分析器、组装器、筛选器都会自动注册，无需手动注册。
- 本包负责到「元素序列」为止。最终全码/简码还需要按 `config.form.mapping` 将元素码位映射为字母（网页端由 worker / libchai 完成）；不要声称本包直接产出最终码表。

## 2. 输出格式约定

- 单个码位用 `序列化(码位)`：
  - 固定编码：直接是字符串；
  - 元素位：`元素名称.索引`，如 `白.0`、`戈.1`。
- 整条序列用 `总序列化(码位列表)`：以空格连接，如 `白.0 白.1 勹.0 4.0`。
- 需要 JSON/YAML 序列化时用 `下转换(码位)`，得到 `{ element: string, index: number }` 或字符串。
- 私用区元素（如 U+E068）在文本中就是私用区字符本身，终端/字体可能显示为空白。需要可读名称时：

```ts
const 名称 = 原始字库.查询(字符实例)?.name; // 如 U+E068 → "左字框"
```

网页端 `src/atoms/cache.ts` 的 `别名显示原子` 就是这套逻辑。

## 4. 必须避免的坑（实测）

### 4.1 字符对象身份：完整流水线只能用一个 `原始字库`

`字符` 是带私有构造器的类，没有池化。`字库` 内部用 `Map<字符, 字形[]>` 按对象身份查找字形。因此：

```ts
// ❌ 错误：获取字库内部又建了一个 原始字库
const 原始字库 = 获取原始字库();
const 字库 = 解包(获取字库(配置));
// 再把这个 原始字库 传给 获取字形分析结果 → 分析结果查不到字形，
// 最终 组装结果.length === 0，而且不会抛错。
```

```ts
// ✅ 正确：自己建一次 原始字库，再用 原始字库.确定(...) 得到字库
const 原始字库 = 获取原始字库(Object.values(配置.data?.repertoire ?? {}));
const 字库 = 解包(原始字库.确定(…));
```

如果任务只用到字库（不碰 `原始字库`），直接 `获取字库(配置)` 没问题；一旦要和 `原始字库` 一起用，就必须按上面的写法复用同一个对象。

### 4.2 分类器要用配置合并后的版本

```ts
const 分类器 = 合并分类器(配置.analysis?.classifier);
```

不要用 `默认分类器`。例如 `yuling` 把「竖钩、竖提、撇点」等归到 6 类，用默认分类器会漏掉这些笔画类别，影响合法元素与拆分。

### 4.3 词典要按 `character_set` 过滤

网页端默认 `general`，`yuling` 配置为 `extended`。不过滤会多出大量字，过滤错会少字，二者都会让条数与网页不一致。只在明确要求「全字集」时才改用 `maximal`。

### 4.4 `名称映射` 不能随便传空 Map

`计算全部合法元素与元素映射` 的结果要传给 `获取字形分析结果`，用于解析 `analysis.customize`。传空映射或漏掉自定义笔画，会让「我」「戋」等自定义拆分失效。必须用：字库全部字符 + 合并后的分类器 + 配置的拼音/自定义元素映射。

### 4.5 配置里的 `data.repertoire` 必须并入原始字库

`获取原始字库(Object.values(配置.data?.repertoire ?? {}))` 不能省略参数。方案可能用私有区补充字形，漏掉会缺字或拆分错误。

### 4.6 每个 Result 都要检查

核心 API 大多返回 `Result<T, Error>`。统一用 `解包`（见上）或 `if (!r.ok) throw r.error`。不要直接访问 `.value`。

### 4.7 e2e 测试不能当作正确性证明

`spec/e2e/examples.spec.ts` 混用了 `获取数据()` 的原始字库和 `获取字库(配置)` 的字库（即 4.1 的错误写法），且只断言 `expect(组装结果).toBeDefined()`，空数组也会通过。自测时至少检查 `组装结果.length > 0`，并抽查「我」「的」等字。

## 5. 常用命令

```bash
# 运行根目录脚本
bun test.ts
bun test.ts hanzi-chai/examples/yuling.yaml /tmp/elements.txt

# 单个测试
cd hanzi-chai/packages/hanzi-chai
bun test ./spec/element.spec.ts

# 包测试（package.json 的 test 脚本）
cd hanzi-chai
bun run --filter hanzi-chai test

# 构建 dist（只有必须从 dist 导入时才需要）
cd hanzi-chai
bun run build:pkg

# lint / format
cd hanzi-chai
bun run lint
bun run format
```

测试里的路径是相对包目录写的（例如 `../../examples`），不要在仓库根目录直接跑 spec，否则找不到样例。

## 6. 任务速查

| 目标 | 入口 |
| --- | --- |
| 读取方案 YAML | `读取配置(path)` |
| 字库 / 字形 | `获取原始字库` + `原始字库.确定`，或 `获取字库(配置)` |
| 词典 | `获取原始词典` → `原始字库.校验词典` → `原始字库.过滤词典` |
| 拼音分析 | `获取拼音分析与元素映射` → `获取拼音分析结果` |
| 字形拆分 | `获取字形分析结果` |
| 元素序列 | `获取组装结果` |
| 元素序列转文本 | `序列化` / `总序列化` |
| 最终字母码表 | 不在本包；用 `config.form.mapping` 或网页端 `libchai` |

## 7. 关键文件

- `test.ts`：完整可运行流水线 + TSV 输出
- `hanzi-chai/packages/hanzi-chai/src/index.ts`：高层 API（`获取字库`、`获取字形分析结果`、`获取组装结果` 等）
- `hanzi-chai/packages/hanzi-chai/src/main.ts`：内置组件注册与导出
- `hanzi-chai/packages/hanzi-chai/src/assembly.ts`：组装器、元素序列、组词规则
- `hanzi-chai/packages/hanzi-chai/src/repertoire.ts`：字库、字形分析、分析结果类型
- `hanzi-chai/src/atoms/cache.ts`：网页端完整流水线（决策、自定义分析、导出格式）
- `hanzi-chai/packages/hanzi-chai/spec/e2e/examples.spec.ts`：样例加载方式（注意 4.7）
- `hanzi-chai/examples/yuling.yaml`：复杂方案样例（自定义拆分、私有区字形、25 键）
- `docs/src/content/docs/development/assembler.md`：组装器与元素序列概念
- `hanzi-chai/CLAUDE.md`：仓库架构与构建目标
