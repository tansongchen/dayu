FROM node:24.12.0-bookworm-slim@sha256:7326fb2dbdce998edd72140946851be64ef4a643e8715e138ca467e8e9d92c99 AS dependencies
WORKDIR /opt/dayu
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --legacy-peer-deps && npm cache clean --force
ARG TARGETARCH
RUN case "$TARGETARCH" in arm64) arch=aarch64 ;; amd64) arch=x64 ;; *) exit 1 ;; esac \
    && npm install --prefix /opt/bun "@oven/bun-linux-${arch}@1.4.4" \
    && ln -s "/opt/bun/node_modules/@oven/bun-linux-${arch}/bin/bun" /opt/bun/bun

FROM node:24.12.0-trixie-slim@sha256:35876cf614d84f076fcd51792d2ebe8ef21663d785d52ef09c2e459b0b199efa
RUN apt-get update && apt-get install -y --no-install-recommends \
    bash ca-certificates curl git ripgrep python3 unzip librime-bin librime-plugin-lua g++ librime-dev \
    && rm -rf /var/lib/apt/lists/*
RUN curl --retry 3 -fsSL https://raw.githubusercontent.com/rime/librime/1.8.5/tools/rime_api_console.cc -o /tmp/rime_api_console.cc \
    && echo 'b4203eb9bb1013328c1f8d9c26f31ac69fd2259ac7cc50e294ec5463265cfaf3  /tmp/rime_api_console.cc' | sha256sum -c - \
    && g++ -O2 /tmp/rime_api_console.cc -lrime -o /usr/local/bin/rime_api_console \
    && mkdir -p /usr/share/doc/rime-console \
    && curl --retry 3 -fsSL https://raw.githubusercontent.com/rime/librime/1.8.5/LICENSE -o /usr/share/doc/rime-console/LICENSE \
    && echo 'f67d27a6d2d586fcfed4b4c886a83747095396a39b6641e18e855086be2ec400  /usr/share/doc/rime-console/LICENSE' | sha256sum -c - \
    && rm /tmp/rime_api_console.cc
COPY --from=dependencies /opt /opt
RUN ln -s /opt/bun/bun /usr/local/bin/bun
COPY snow-dayu /knowledge/snow-dayu
COPY chaifen-dayu /knowledge/chaifen-dayu
RUN test -f /knowledge/snow-dayu/docs/index.md \
    && test -f /knowledge/snow-dayu/rime-snow-pinyin/default.yaml \
    && test -f /knowledge/chaifen-dayu/docs/package.json \
    && ln -s /opt/dayu/node_modules /knowledge/chaifen-dayu/hanzi-chai/node_modules \
    && cd /knowledge/chaifen-dayu/hanzi-chai \
    && bun run fetch \
    && for file in repertoire.json.deflate cjk.txt dictionary.txt distribution.txt equivalence.txt tygf.txt gf0014.txt; do \
         test -s "packages/hanzi-chai/src/data/$file" || { echo "Missing dataset: $file" >&2; exit 1; }; \
       done \
    && rm -rf public/data
COPY start.mjs dayu-runtime-logging.mjs /opt/dayu/
RUN mkdir -p /state/dsh /state/home /workspace && chown -R node:node /state /workspace
ENV HOME=/state/home DSH_HOME=/state/dsh NODE_USE_ENV_PROXY=1 NARB_DISABLE_NATIVE_CACHE=1 LANG=C.UTF-8 \
    PATH=/opt/dayu/node_modules/.bin:/usr/local/bin:/usr/bin:/bin
WORKDIR /workspace
USER 1000:1000
ENTRYPOINT ["node", "/opt/dayu/start.mjs"]
