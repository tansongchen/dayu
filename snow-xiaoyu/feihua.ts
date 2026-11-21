import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { feihuaColors, type Lookup, type LookupResult } from './scheme.ts';

export function feihuaBetaPath() {
  return (
    process.env.XIAOYU_FEIHUA_BETA_FILE ||
    fileURLToPath(new URL('./data/feihua-beta.json', import.meta.url))
  );
}
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item: unknown) => typeof item === 'string');
function validResult(value: unknown): value is LookupResult {
  if (
    !record(value) ||
    !strings(value.paths) ||
    !Array.isArray(value.roots) ||
    !Array.isArray(value.rows) ||
    !value.rows.length
  )
    return false;
  const strokeCount = value.paths.length;
  const roles = value.roots.map((root: unknown) => (record(root) ? root.colorRole : undefined));
  if (
    !roles.length ||
    roles.length > 3 ||
    ![
      ['component1', 'component2', 'component3'].slice(0, roles.length).join(','),
      ['positive', 'remainder1', 'remainder2'].slice(0, roles.length).join(','),
    ].includes(roles.join(','))
  )
    return false;
  return (
    value.roots.every(
      (root: unknown) =>
        record(root) &&
        typeof root.name === 'string' &&
        Array.isArray(root.strokes) &&
        root.strokes.every(
          (stroke: unknown) =>
            typeof stroke === 'number' &&
            Number.isInteger(stroke) &&
            stroke >= 0 &&
            stroke < strokeCount,
        ),
    ) &&
    value.rows.every(
      (row: unknown) =>
        record(row) &&
        typeof row.pinyin === 'string' &&
        Array.isArray(row.elements) &&
        row.elements.length >= 2 &&
        row.elements.length <= 4 &&
        row.elements.every(
          (element: unknown, index: number) =>
            record(element) &&
            typeof element.label === 'string' &&
            typeof element.name === 'string' &&
            typeof element.key === 'string' &&
            /^[aoeiuv;/bpmfdtnlgkhjqxzcsryw,.]$/.test(element.key) &&
            typeof element.colorRole === 'string' &&
            Object.hasOwn(feihuaColors, element.colorRole) &&
            typeof element.colorIndex === 'number' &&
            Number.isInteger(element.colorIndex) &&
            element.colorIndex >= 0 &&
            element.colorIndex < 6 &&
            (index === 0
              ? element.colorIndex === 0 && element.colorRole === 'initial'
              : element.colorIndex >= 2 && element.colorRole === roles[element.colorIndex - 2]) &&
            (element.paths === undefined || strings(element.paths)),
        ),
    )
  );
}

// This bundle is exported from the Rust solution, not reanalysed by hanzi-chai.
export function createFeihuaBetaLookup(path = feihuaBetaPath()): Lookup {
  const data: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!record(data) || data.version !== 2 || !record(data.characters))
    throw new Error('无效的飞花 beta 展示数据');
  const characters = new Map<string, LookupResult>();
  for (const [character, value] of Object.entries(data.characters)) {
    if ([...character].length !== 1 || !validResult(value))
      throw new Error(`飞花 beta 展示数据无效：${character}`);
    characters.set(character, value);
  }
  if (!characters.size) throw new Error('飞花 beta 展示数据为空');
  return (character) => characters.get(character) ?? null;
}
