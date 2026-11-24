import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import yaml from 'js-yaml';

process.umask(0o077);
const profile = process.argv[2];
if (!['snow-dayu', 'chaifen-dayu'].includes(profile)) {
  console.error('Usage: bun start.ts snow-dayu|chaifen-dayu [--check]');
  process.exit(1);
}
function required(key: string): string {
  const value = process.env[key]?.trim();
  if (!value)
    throw new Error(
      `请在 .env 中填写 ${key === 'QQBOT_APPID' ? (profile === 'snow-dayu' ? 'SNOW_QQ_APP_ID' : 'CHAIFEN_QQ_APP_ID') : key === 'QQBOT_SECRET' ? (profile === 'snow-dayu' ? 'SNOW_QQ_APP_SECRET' : 'CHAIFEN_QQ_APP_SECRET') : key}`,
    );
  return value;
}
const provider = 'deepseek-official';
const appId = required('QQBOT_APPID');
const appSecret = required('QQBOT_SECRET');
const model = process.env.DEEPSEEK_MODEL?.trim() || 'deepseek-flash';
const check = process.argv.includes('--check');
if (!check) required('DEEPSEEK_API_KEY');

const workspace = process.cwd();
const home = '/state/dsh';
const configDir = `${home}/profiles/${profile}`;
fs.mkdirSync(configDir, { recursive: true });
fs.mkdirSync('/state/home', { recursive: true });
fs.mkdirSync(`${workspace}/output`, { recursive: true });
function link(target: string, name: string): void {
  const stat = fs.lstatSync(name, { throwIfNoEntry: false });
  if (stat?.isSymbolicLink() && fs.readlinkSync(name) === target) return;
  // Old deployments left empty directories under their nested volume mounts.
  if (stat?.isDirectory() && fs.readdirSync(name).length === 0) fs.rmdirSync(name);
  else if (stat) throw new Error(`Refusing to replace existing path: ${name}`);
  fs.symlinkSync(target, name);
}
link('/opt/dayu/node_modules', `${configDir}/node_modules`);
const knowledge = `/knowledge/${profile}`;
for (const item of fs.readdirSync(knowledge, { withFileTypes: true })) {
  if (item.isDirectory()) link(`${knowledge}/${item.name}`, `${workspace}/${item.name}`);
  else fs.copyFileSync(`${knowledge}/${item.name}`, `${workspace}/${item.name}`);
}
const topic = profile === 'snow-dayu' ? '冰雪拼音' : '汉字自动拆分系统';
const prompt = `你是「${topic}」专家，只回答与${topic}相关的问题。始终用简体中文回答。回答前先检索工作目录里的文档和源码，遵守 AGENTS.md。知识库只读，生成文件写到 output/。没有资料支持的结论不要编造。回答简洁，过于复杂或冗长的任务给出思路。`;
const patches: Record<string, unknown>[] = [
  {
    id: 'im-qqbot',
    config: {
      provider,
      model,
      appId,
      appSecret,
      cwd: workspace,
      requireMention: true,
      textChunkLimit: 4500,
      sessionIdleTimeout: 1800000,
      maxQueue: 20,
      processingTimeoutMs: 1800000,
      historyLimit: 10,
      debug: false,
      directPrompt: prompt,
      groupPrompt: prompt,
      access: { c2cMode: 'open', c2cAllow: [], groupMode: 'open', groupAllow: [] },
    },
  },
  { id: 'agent-default-model', config: { provider, model } },
  { id: 'session-log-deepseek', config: { enabled: false } },
  { id: 'plugin-package-inventory-deepseek', config: { enabled: false } },
  { id: 'session-persistence-jsonl', config: { root: `${configDir}/sessions` } },
  { insert: [{ id: 'dayu-runtime-logging', name: '/opt/dayu/dayu-runtime-logging.ts' }] },
];
const bundles = ['@deepseek-ai/dsh-base', '@tencent-connect/dsh-qqbot'];
fs.writeFileSync(
  `${configDir}/package.json`,
  JSON.stringify({ private: true, dsh: { profile: { bundles } } }),
);
fs.writeFileSync(`${configDir}/cordis.yml`, '[]\n');
fs.writeFileSync(`${configDir}/cordis.patch.yml`, yaml.dump(patches), { mode: 0o600 });
process.chdir(workspace);
const cli = '/opt/dayu/node_modules/@deepseek-ai/dsh/lib/bin.js';
if (check) {
  const result = spawnSync(process.execPath, [cli, '--profile', profile, '--dump-config'], {
    encoding: 'utf8',
  });
  if (result.status !== 0)
    throw new Error(
      'DSH configuration check failed (configuration output withheld because it contains secrets)',
    );
  console.log(`${profile}: configuration and workspace initialized successfully`);
} else {
  process.argv = [process.execPath, cli, '--profile', profile];
  const { runCli } = await import(cli);
  await runCli();
}
