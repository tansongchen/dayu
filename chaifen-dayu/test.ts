/**
 * 读取 yuling.yaml，运行完整的分析、组装流程，生成元素序列表并保存为文本文件。
 *
 * 输出为制表符分隔的文本（TSV）：
 *   词、频率、拼音、元素1…元素N、元素序列
 * 「元素名.索引」表示该元素的第 index 个码位，与库内的序列化格式一致；
 * 私用区元素会以私用区字符本身的形式出现。
 *
 * 用法（在仓库根目录运行）：
 *   bun test.ts
 *   bun test.ts hanzi-chai/examples/yuling.yaml yuling-elements.txt
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  决策图,
  合并分类器,
  序列化,
  总序列化,
  标准化自定义,
  获取决策与决策空间,
  获取原始字库,
  获取原始词典,
  获取字形分析结果,
  获取拼音分析与元素映射,
  获取拼音分析结果,
  获取组装结果,
  计算全部合法元素与元素映射,
  读取配置,
} from './hanzi-chai/packages/hanzi-chai/src/index';

const 默认配置文件 = resolve(import.meta.dir, 'hanzi-chai/examples/yuling.yaml');
const 默认输出文件 = resolve(import.meta.dir, 'yuling-elements.txt');

const 配置文件 = resolve(process.argv[2] ?? 默认配置文件);
const 输出文件 = resolve(process.argv[3] ?? 默认输出文件);

/** 从 Result 中取出值，失败时直接抛出错误。 */
function 解包<T>(结果: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!结果.ok) throw 结果.error;
  return 结果.value;
}

const 配置 = 读取配置(配置文件);

// 1. 字库与词典。原始字库只构造一次，确保各阶段使用同一批「字符」对象。
const 原始字库 = 获取原始字库(Object.values(配置.data?.repertoire ?? {}));
const 词典 = 原始字库
  .过滤词典(原始字库.校验词典(获取原始词典(undefined)), 配置.data?.character_set ?? 'general')
  .filter((entry) => entry.词.length === 1);

// 2. 根据配置中的字形自定义、变换器和字形来源确定最终字库。
const 字库 = 解包(
  原始字库.确定(
    标准化自定义(配置.data?.glyph_customization ?? {}),
    配置.data?.transformers ?? [],
    配置.data?.glyph_sources ?? [],
  ),
);

// 3. 拼音分析、字形分析与决策。
const 分类器 = 合并分类器(配置.analysis?.classifier);
const { 拼音元素映射, 拼音分析映射 } = 获取拼音分析与元素映射(配置, 词典);
const { 名称映射 } = 计算全部合法元素与元素映射(
  [...字库].map(({ 字符 }) => 字符),
  分类器,
  拼音元素映射,
  new Map(),
);
const 拼音分析结果 = 获取拼音分析结果(拼音分析映射, 词典);
const 字形分析结果 = 解包(获取字形分析结果(配置, 字库, 词典, 名称映射, 原始字库));
const { 决策, 决策空间 } = 获取决策与决策空间(配置, 字库, 词典, 原始字库);
const 线性化决策 = 解包(new 决策图(决策).线性化());

// 4. 组装，得到每个词的一个或多个元素序列。
const 组装结果 = 解包(获取组装结果(配置, 决策, 决策空间, 线性化决策, 拼音分析结果, 字形分析结果));

const 行 = 组装结果.map((条目) => {
  const 词 = 条目.词.map((字符) => 字符.获取名称()).join('');
  const 拼音 = 条目.拼音来源列表.map((来源) => 来源.join(' ')).join(', ');
  const 元素列表 = 条目.元素序列.元素序列.map((码位) => 序列化(码位));
  return {
    词,
    频率: 条目.频率,
    拼音,
    元素列表,
    序列: 总序列化(条目.元素序列.元素序列),
  };
});

// 与网页端一致，按词频从高到低排列。
行.sort((a, b) => b.频率 - a.频率 || a.词.localeCompare(b.词, 'zh'));

const 最大码长 = 行.reduce(
  (最长, { 元素列表 }) => Math.max(最长, 元素列表.length),
  配置.encoder.max_length,
);
const 表头 = [
  '词',
  '频率',
  '拼音',
  ...Array.from({ length: 最大码长 }, (_, i) => `元素${i + 1}`),
  '元素序列',
];
const 内容 = [
  表头,
  ...行.map(({ 词, 频率, 拼音, 元素列表, 序列 }) => [
    词,
    频率.toString(),
    拼音,
    ...Array.from({ length: 最大码长 }, (_, i) => 元素列表[i] ?? ''),
    序列,
  ]),
]
  .map((列) => 列.join('\t'))
  .join('\n');

mkdirSync(dirname(输出文件), { recursive: true });
writeFileSync(输出文件, `${内容}\n`, 'utf-8');

console.log(`已生成元素序列表：${输出文件}（${行.length} 条记录，最大码长 ${最大码长}）`);
