import {
  type 元素,
  type 字库,
  type 字形,
  type 字根,
  是部件,
  生成笔画路径,
  解包结果,
  部件字根,
  type 默认部件分析,
} from 'hanzi-chai';
import { describeKey, prepareLookup } from './scheme.ts';

interface Root {
  element: 元素;
  tagged: 字根;
  strokes: number[];
}

type Analysis = Extract<ReturnType<字库['准备分析']>, { ok: true }>['value']['复合体分析器'];

function componentSplits(glyph: 字形, analysis: Analysis) {
  const entry = 是部件(glyph) && analysis.查找部件分析结果(glyph);
  if (!entry || !('当前拆分方式' in entry)) return undefined;
  return (entry as 默认部件分析).当前拆分方式.拆分方式;
}

function collectRoots(
  glyph: 字形,
  indices: number[],
  analysis: Analysis,
): {
  roots: Root[];
  parts?: Root[][];
} {
  if (是部件(glyph)) {
    const splits = componentSplits(glyph, analysis);
    if (!splits) throw new Error('键道部件缺少拆分结果');
    // The library marks custom splits without geometry with a zero bit mask.
    // xkjd uses full-length stroke-category overrides and one shortened
    // override for 暵. Only map a shortened override if it matches the prefix.
    const categories = splits.map((split) => split.字根.获取名称()).join('');
    const strokeByPosition =
      splits.every(
        (split) => split.笔画二进制表示 === 0 && /^[1-5]$/.test(split.字根.获取名称()),
      ) &&
      (splits.length === indices.length || glyph.标准笔顺.startsWith(categories));
    return {
      roots: splits.map((split, i) => {
        const strokes = strokeByPosition ? [i] : split.笔画二进制表示 === 0 ? [] : split.笔画索引;
        return makeRoot(
          split.字根,
          strokes.flatMap((index) => ((indices[index] ?? -1) >= 0 ? [indices[index]] : [])),
        );
      }),
    };
  }

  const wholeRoot = analysis.查找字根(glyph);
  if (wholeRoot)
    return {
      roots: [
        makeRoot(
          wholeRoot,
          indices.filter((index) => index >= 0),
        ),
      ],
    };

  const partIndices = glyph.部分列表.map((part) =>
    Array.from({ length: part.图形盒子.获取笔画列表().length }, (_, i) => i),
  );
  const mapped = partIndices.map(() => [] as number[]);
  let offset = 0;
  for (const block of glyph.笔画列表) {
    const part = partIndices[block.index];
    for (const index of part.slice(block.from ?? 0, (block.to ?? part.length - 1) + 1))
      mapped[block.index][index] = indices[offset++] ?? -1;
  }
  const parts = glyph.部分列表.map((part, i) => collectRoots(part, mapped[i], analysis).roots);
  const byTag = new Map(parts.flat().map((root) => [root.tagged, root]));
  const ordered = analysis.执行笔顺(
    glyph.部分列表.map((part, i) => ({
      字根序列: parts[i].map((root) => root.tagged),
      部件分析: 是部件(part) ? analysis.查找部件分析结果(part) : undefined,
    })),
    glyph.笔画列表,
  );
  const roots = ordered.map((root) => {
    const match = byTag.get(root);
    if (!match) throw new Error('键道字根缺少笔画映射');
    return match;
  });
  return { roots, parts };
}

function makeRoot(root: 字根, strokes: number[]): Root {
  const element = root instanceof 部件字根 ? root.元素 : root;
  // The assembler reads names, so a distinct instance per occurrence keeps
  // two identical roots separate and the repeated final key on the same root.
  const taggedElement = Object.create(element) as typeof element;
  const tagged =
    root instanceof 部件字根
      ? new 部件字根(taggedElement as 部件字根['元素'], root.获取部件())
      : (taggedElement as 字根);
  return { element, tagged, strokes };
}

const strokeNames = ['横', '竖', '撇', '点', '折'];

function displayElement(name: string): string {
  return /^[1-5]$/.test(name) ? strokeNames[Number(name) - 1] : name.replace(/^键道[声韵]母-/, '');
}

export function createKeytaoLookup() {
  const { context, assembler, readings } = prepareLookup('xkjd');
  return (character: string) => {
    const entries = readings.get(character);
    if (!entries?.length) return null;
    const char = entries[0].词[0];
    const original = context.字库.查询字符的字形(char)?.[0];
    if (!original) return null;
    const prepared = 解包结果(
      context.字库.准备分析(context.字形分析配置, new Set([char])),
      '/analysis',
    );
    const { 复合体分析器: analyzer, 部件分析器: componentAnalyzer } = prepared;
    for (const component of prepared.待分析部件集合) {
      analyzer.部件分析结果.set(
        component,
        解包结果(componentAnalyzer.分析(component), '/analysis'),
      );
    }
    const glyph = prepared.取分析字形(original);
    const entry = 是部件(glyph)
      ? analyzer.查找部件分析结果(glyph)
      : 解包结果(analyzer.分析(glyph), '/analysis');
    if (!entry) throw new Error('键道部件缺少拆分结果');
    const strokes = glyph.图形盒子.获取笔画列表();
    const indices = strokes.map((_, i) => i);
    const { roots, parts } = collectRoots(glyph, indices, analyzer);
    const matches = (expected: 字根[], actual: Root[]) =>
      expected.length === actual.length &&
      expected.every((root, i) => root.获取名称() === actual[i]?.element.获取名称());
    if (!matches(entry.字根序列, roots)) throw new Error('键道笔画与字根顺序不一致');

    type AssemblyInput = typeof entry & {
      sources: string[];
      首部字根序列?: 字根[];
      余部字根序列?: 字根[];
    };
    const taggedEntry = {
      ...entry,
      sources: [],
      字根序列: roots.map((root) => root.tagged),
    } as AssemblyInput;
    if (
      '复合体' in taggedEntry &&
      taggedEntry.首部字根序列?.length &&
      taggedEntry.余部字根序列?.length
    ) {
      const order = [...taggedEntry.复合体.部分列表.keys()].sort(
        (a, b) =>
          taggedEntry.复合体.笔画列表.findIndex((block) => block.index === a) -
          taggedEntry.复合体.笔画列表.findIndex((block) => block.index === b),
      );
      const [head = [], ...rest] = order.map((index) => parts?.[index] ?? []);
      const tail = rest.flat();
      if (!matches(taggedEntry.首部字根序列, head) || !matches(taggedEntry.余部字根序列, tail)) {
        throw new Error('键道首部与余部字根不一致');
      }
      taggedEntry.首部字根序列 = head.map((root) => root.tagged);
      taggedEntry.余部字根序列 = tail.map((root) => root.tagged);
    }

    const occurrences = new Map<元素, number>(
      roots.map((root, i) => [root.tagged instanceof 部件字根 ? root.tagged.元素 : root.tagged, i]),
    );
    const rows = entries.map((reading) => {
      const assembled = assembler.一字词组装(char, taggedEntry, reading.元素映射[0]);
      if (!assembled.ok) throw assembled.error;
      const elements = assembled.value.元素序列.map((position, i) => {
        if (typeof position === 'string' || !position.element) throw new Error('键道码位缺少元素');
        const rootIndex = occurrences.get(position.element);
        const element = rootIndex === undefined ? position.element : roots[rootIndex].element;
        const key = describeKey(position, element, context.线性化决策);
        const name = displayElement(element.获取名称());
        const label = i === 0 ? '声母' : i === 1 ? '韵母' : '形码';
        return { label, name, key, colorIndex: rootIndex === undefined ? i : rootIndex + 2 };
      });
      return { pinyin: reading.拼音[0], elements };
    });
    return {
      paths: 生成笔画路径(strokes),
      roots: roots.map((root) => ({
        strokes: root.strokes,
        name: displayElement(root.element.获取名称()),
      })),
      rows,
    };
  };
}
