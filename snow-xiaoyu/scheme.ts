import {
  type 元素,
  准备方案,
  type 强类型元素位或编码,
  type 拼音分析,
  是部件,
  获取原始词典,
  获取字库,
  获取注册表,
  解包结果,
  读取示例配置,
} from 'hanzi-chai';

export const schemeNames = { 键道: '星空键道', 四拼: '冰雪四拼' } as const;
export type Scheme = keyof typeof schemeNames;

export function prepareLookup(id: 'xkjd' | 'snow4') {
  const config = 读取示例配置(id);
  const context = 准备方案(config, {
    字库: 获取字库(config),
    原始词典: 获取原始词典().filter((entry) => [...entry.词].length === 1),
  });
  const assembler = 获取注册表().创建组装器(config.encoder.assembler ?? '默认', context.组装配置);
  if (!assembler) throw new Error(`缺少组装器：${id}`);
  const readings = new Map<string, 拼音分析[]>();
  for (const entry of context.拼音分析结果) {
    const name = entry.词[0].获取名称();
    const entries = readings.get(name) ?? [];
    entries.push(entry);
    readings.set(name, entries);
  }
  return { context, assembler, readings };
}

export function describeKey(position: 强类型元素位或编码, element: 元素, keys: Map<元素, string>) {
  if (typeof position === 'string') return position;
  const key = keys.get(element)?.[position.index];
  if (!key) throw new Error(`元素缺少键位：${element.获取名称()}`);
  return key;
}

export function createSnow4Lookup() {
  const { context, assembler, readings } = prepareLookup('snow4');
  return (character: string) => {
    const entries = readings.get(character);
    if (!entries?.length) return null;
    const char = entries[0].词[0];
    const glyph = context.字库.查询字符的字形(char)?.[0];
    if (!glyph) return null;
    // The default assembler only reads pinyin for snow4's encoder graph.
    const analysis = {
      ...(是部件(glyph) ? { 部件: glyph } : { 复合体: glyph }),
      字根序列: [],
      sources: [],
    };
    const rows = entries.flatMap((reading) => {
      const { 元素序列 } = 解包结果(
        assembler.一字词组装(char, analysis, reading.元素映射[0]),
        '/encoder',
      );
      const elements = 元素序列.map((position, colorIndex) => {
        if (typeof position === 'string')
          return { label: '固定', name: position, key: position, colorIndex };
        const [label, name] = position.element.获取名称().split('-', 2) as [string, string];
        const key = describeKey(position, position.element, context.线性化决策);
        return { label, name, key, colorIndex };
      });
      return elements.length ? [{ pinyin: reading.拼音[0], elements }] : [];
    });
    return rows.length ? { paths: [], roots: [], rows } : null;
  };
}
