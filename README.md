# 大鱼

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
