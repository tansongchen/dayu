# 大鱼

在 QQ 群聊或私聊发送 `键道 雪`，`snow-xiaoyu` 会按 `hanzi-chai@1.0.0-beta.1` 内置的 `xkjd.yaml` 查询星空键道编码，并回复一张 PNG。拼音部分使用中性色，形码前四个取码字根依次使用红、绿、蓝、紫，其余笔画为灰色。单笔画字根「横竖撇点折」显示为「⼀⼁⼃⼂乙」。每个读音旁各有一行元素和全码，字根、元素和键位按颜色对应。字不在方案词典时会回复提示。

发送 `四拼 雪` 会使用内置的 `snow4.yaml`。冰雪四拼是纯音码，图片按读音列出取码元素与全码，全部使用中性色，无字形区。

发送 `飞花beta 营` 会使用本地导出的飞花优化方案，显示正根／余根或部件基本拆分及各读音全码。准包围仅用于取码，图中仍保留原上下或三分布局；着色通过两棵树的笔画对应定位。部件字第 1、2、3 根固定为绿、蓝、紫；复合体正根为红，两个余根为绿、蓝。字根以小图展示，与主字形的颜色一一对应；AB／ABB／ABBB 重复键沿用同一个字根颜色。资料由专用 Rust 优化器的快照导出，逐字与其码表核对，不使用通用飞花分析器重新拆分。

三个方案都支持一次查询多个字，例如 `飞花beta 冰雪飞花`，同一张图中排版：成功查询 1 至 3 个字时排一列，4 个字及以上排两列，按从左到右、从上到下的顺序排列，重复的字保留。忽略输入中的空白，最多处理前 10 个字符，超过时随图片提示截断；其中未收录的字符会跳过并列出警告。若全部未收录，只回复文字提示。

在相邻 `libchai-snow` 仓库生成展示资料，再复制到此仓库：

```sh
# 在 libchai-snow 中，选择一个已经优化并导出的快照。
bun src/feihua/postprocess.ts --tree-data output/feihua-current/input.json --solution output/feihua-current/solution.json

# 回到 dayu；完整资料先复制到临时文件，再原子替换。
mkdir -p snow-xiaoyu/data
cp ../libchai-snow/output/feihua-current/feihua-beta.json snow-xiaoyu/data/feihua-beta.json.tmp
mv snow-xiaoyu/data/feihua-beta.json.tmp snow-xiaoyu/data/feihua-beta.json
bun run check:snow-xiaoyu
```

展示资料使用版本 2，字根与元素含显式配色角色；旧版 JSON 需要重新导出。默认读取 `snow-xiaoyu/data/feihua-beta.json`；本地可用 `XIAOYU_FEIHUA_BETA_FILE` 指定其他导出文件。展示资料不纳入版本管理，Docker 构建会携带它，Compose 另外只读挂载整个资料目录。首次接入代码后需要重新构建服务；之后替换 JSON 会自动重新载入并清除飞花图片缓存，不需要重启机器人。替换期间请使用上述临时文件与 `mv`，避免读到半份 JSON。未收录的字回复文字提示，不影响键道、四拼命令。

在 QQ 开放平台创建名为 `snow-xiaoyu` 的机器人，开通群聊及图片消息权限，将它加入测试群，并在 `.env` 填写 `XIAOYU_QQ_APP_ID` / `XIAOYU_QQ_APP_SECRET`。显示名称由 QQ 开放平台设置。然后运行：

```sh
docker compose up -d --build snow-xiaoyu
docker compose logs -f --tail=50 snow-xiaoyu
```

此服务使用独立的轻量镜像，内置 Bun 1.4.4，无需知识库子模组、模型 Key 或持久化卷。Compose 默认只启动原来的两个服务；按上述命令显式指定 `snow-xiaoyu` 即可启动小鱼。代码同时处理普通群消息和 @ 群消息；QQ 官方平台通常只推送 @ 机器人的群消息，若没有全量群消息权限，请使用 `@snow-xiaoyu 键道 雪`。能否免 @ 触发取决于平台实际下发的事件。

本地执行使用 Bun 1.4.4+（Linux 需安装 Noto Sans CJK 字体）：`npm ci --legacy-peer-deps` 安装依赖，然后 `bun run snow-xiaoyu`（自动读取根目录 `.env`）。`bun run check:snow-xiaoyu` 仅检查真实字库和 PNG 渲染，不连接 QQ；`bun test ./snow-xiaoyu` 验证消息过滤、字形渲染和图片回复流程；`bun run typecheck` 检查服务脚本类型。仓库的启动脚本和日志插件也统一为 TypeScript，通过 Bun 执行。容器内可运行 `docker compose run --rm snow-xiaoyu --check`。

`bun run check` 检查仓库自有 TypeScript 和 JSON 的格式、导入顺序和 lint 规则。`bun run format` 自动修复格式和可安全修复的问题。

冰雪大鱼和拆分大鱼的 QQ 机器人服务。需要 Docker Engine + Compose（或 Docker Desktop）、Git、两个 QQ 机器人的 AppID / AppSecret，以及支持工具调用的模型 API Key。支持 Linux AMD64、ARM64；宿主机无需安装 Node、Bun 或 DSH。

```sh
git clone --recurse-submodules https://github.com/tansongchen/dayu.git
cd dayu
cp .env.example .env
# 编辑 .env，填写 QQ 凭据及模型配置
docker compose up -d --build
```

只启动一个机器人时，在最后一条命令后加 `snow-dayu` 或 `chaifen-dayu`，只需填写对应的 QQ 凭据。通过 `docker compose logs -f --tail=50` 查看连接状态，出现 `Bot ready!` 表示 QQ 已连接；机器人需要被 @ 才处理群消息。默认接受所有私聊和所在群的消息。

`.env` 中 `LLM_API=openai-responses` 对应 Responses API，`openai-completions` 对应兼容的 Chat Completions API；地址、模型名称和 Key 必须属于同一模型服务。默认直接联网，如需代理，填写 `DAYU_PROXY`。本机代理可使用 `http://host.docker.internal:7897`，代理端口需允许容器访问。不要提交 `.env`。

首次构建会安装依赖，并调用 `hanzi-chai` 自带的 `bun run fetch`，从 `api.chaifen.app`、`assets.chaifen.app` 下载拆分数据；必要数据缺失会中止构建，修复网络后重试。知识库来自四个 Git 子模组，随镜像一起构建，无需手动准备数据卷或本机 DSH 配置。已有检出缺少子模组时运行 `git submodule update --init --recursive`。

两个服务以非 root 用户运行，根文件系统只读，禁止提权，不挂载宿主机目录或 Docker socket。知识库在只读的 `/knowledge` 中，`/workspace/docs` 等路径指向对应知识库；生成文件写到 `/workspace/output`。容器仍有网络访问能力，能读取自身运行凭据。

会话和工作文件保存在各自的命名卷中。`docker compose restart` 重启服务；修改 `.env` 后运行 `docker compose up -d`；`docker compose down` 停止服务并保留数据，**不要加 `-v`，否则会删除会话和工作文件**。启动会更新工作区中的 `AGENTS.md` 和示例脚本；自写脚本应另取文件名。

检查配置可运行 `docker compose run --rm snow-dayu snow-dayu --check`，它初始化工作区并检查 DSH 配置，不连接 QQ，也不会验证 API Key 是否有效。从容器取出结果可用 `docker compose cp chaifen-dayu:/workspace/output ./output`。

更新知识库时更新对应子模组指针，再运行 `docker compose up -d --build`。强制重新下载拆分数据使用 `docker compose build --no-cache`。Docker 服务启动后容器按 `unless-stopped` 自动恢复；Docker Desktop 用户可在应用设置中启用登录启动。

Rime 控制台通过校验过的上游源码构建，许可证保留在镜像 `/usr/share/doc/rime-console/LICENSE`。需要实测时先将 `/workspace/rime-snow-pinyin` 复制到 `output/`，再在副本运行 `rime_api_console`。当前 librime 1.13.1 可查询候选，但缺少统计插件所需的 `get_time_ms`，不能用来验证打字速度统计。

已有部署若使用 Codex 登录，可在 `.env` 设置 `LLM_PROVIDER=openai-codex`，继续使用对应 state 卷内已有的 `PI_OAUTH_OPENAI_CODEX` 凭据。新部署默认使用 API Key，不需要复制他人的账号文件。需要接续旧会话时，用 `SNOW_WORKSPACE` / `CHAIFEN_WORKSPACE` 指定原来的容器内工作目录；这两个选项只改变容器内路径，不挂载宿主机目录。
