import { existsSync, statSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import { createFeihuaBetaLookup, feihuaBetaPath } from './feihua.ts';
import { createKeytaoLookup } from './keytao.ts';
import {
  createSnow4Lookup,
  type FeihuaColorRole,
  feihuaColors,
  type Lookup,
  type Scheme,
  schemeNames,
} from './scheme.ts';

export function isSingleHanzi(text: unknown): text is string {
  return (
    typeof text === 'string' &&
    /^(?:\p{Unified_Ideograph}|[\u3007\uF900-\uFAFF\u{2F800}-\u{2FA1F}])$/u.test(text)
  );
}

const escapeXml = (text: string) =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const rootColors = ['#b7353b', '#287745', '#2368a5', '#713eaa'];
const phoneticColor = '#526077';
const strokeSymbols: Record<string, string> = { 横: '⼀', 竖: '⼁', 撇: '⼃', 点: '⼂', 折: '乙' };
const grayStroke = '#a4aab3';
function feihuaColor(role: FeihuaColorRole | undefined) {
  if (role === undefined) throw new Error('飞花展示资料缺少配色角色，请重新导出');
  return feihuaColors[role];
}
const chipGap = 6;
const padding = 14;
const panelGap = 10;
const titleHeight = 52;
const pinyinWidth = 7 * 14;
const font = process.platform === 'darwin' ? 'Hiragino Sans GB' : 'Noto Sans CJK SC';
const fontFile =
  process.platform === 'darwin'
    ? '/System/Library/Fonts/Hiragino Sans GB.ttc'
    : '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc';
// resvg's system font scan misses Debian's OpenType directory in the bot image.
const fontOptions = { fontFiles: existsSync(fontFile) ? [fontFile] : [] };

function renderPng(source: string) {
  return Buffer.from(new Resvg(source, { font: fontOptions }).render().asPng());
}

type Panel = { width: number; height: number; draw(width: number, height: number): string };

function text(x: number, y: number, size: number, value: string, fill = '#243148', center = false) {
  return `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}"${center ? ' text-anchor="middle"' : ''}>${escapeXml(value)}</text>`;
}

function textWidth(value: string, size: number) {
  return Math.ceil(
    [...value].reduce((width, char) => width + (/^[\x20-\x7e]$/u.test(char) ? 0.7 : 1), 0) * size,
  );
}

function composePanels(panels: Panel[], scheme: Scheme): string {
  const columns = panels.length <= 3 ? 1 : 2;
  const rows: Panel[][] = [];
  for (let i = 0; i < panels.length; i += columns) rows.push(panels.slice(i, i + columns));
  const columnWidths = Array.from({ length: columns }, (_, column) =>
    Math.max(...rows.map((row) => row[column]?.width ?? 0)),
  );
  const gridWidth = columnWidths.reduce((sum, width) => sum + width, 0) + (columns - 1) * panelGap;
  const width = 2 * padding + Math.max(textWidth(schemeNames[scheme], 22), gridWidth);
  let y = titleHeight;
  const drawing: string[] = [];
  for (const row of rows) {
    const rowHeight = Math.max(...row.map((item) => item.height));
    let x = padding;
    for (const [column, item] of row.entries()) {
      const columnWidth = columnWidths[column];
      drawing.push(`<g transform="translate(${x} ${y})">${item.draw(columnWidth, rowHeight)}</g>`);
      x += columnWidth + panelGap;
    }
    y += rowHeight + panelGap;
  }
  const height = y - panelGap + padding;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" fill="#eef2f7"/>
    <g font-family="${font}, sans-serif">
      ${text(padding, 34, 22, schemeNames[scheme])}
      ${drawing.join('')}
    </g>
  </svg>`;
}

export function createGlyphRenderer(options: { feihuaBetaFile?: string } = {}) {
  const createLookup: Record<Scheme, () => Lookup> = {
    键道: createKeytaoLookup,
    四拼: createSnow4Lookup,
    飞花beta: () => createFeihuaBetaLookup(options.feihuaBetaFile),
  };
  const lookups: Partial<Record<Scheme, Lookup>> = {};
  const cache = new Map<string, Buffer>();
  let betaVersion = '';
  function syncBeta(scheme: Scheme) {
    if (scheme !== '飞花beta') return;
    const path = options.feihuaBetaFile ?? feihuaBetaPath();
    const stat = statSync(path);
    const version = `${path}:${stat.ino}:${stat.size}:${stat.mtimeMs}`;
    if (version === betaVersion) return;
    delete lookups.飞花beta;
    for (const key of cache.keys()) if (key.startsWith('飞花beta:')) cache.delete(key);
    betaVersion = version;
  }

  function panel(character: string, scheme: Scheme) {
    if (!isSingleHanzi(character)) return null;
    syncBeta(scheme);
    lookups[scheme] ??= createLookup[scheme]();
    const result = lookups[scheme](character);
    if (!result) return null;
    const { paths, roots, rows } = result;
    // Only shape roots consume colors; repeated keys from one occurrence share a color.
    const usedRoots = [
      ...new Set(
        rows.flatMap((row) =>
          row.elements
            .filter((element) => element.kind === 'shape')
            .map((element) => element.colorIndex),
        ),
      ),
    ];
    const elementColors = new Map(
      rows
        .flatMap((row) => row.elements)
        .map((element) => [
          element.colorIndex,
          scheme === '飞花beta'
            ? feihuaColor(element.colorRole)
            : element.kind === 'shape'
              ? (rootColors[usedRoots.indexOf(element.colorIndex)] ?? grayStroke)
              : phoneticColor,
        ]),
    );
    const strokeColors = new Map<number, string>();
    roots.forEach((root, index) => {
      const fill =
        scheme === '飞花beta' ? feihuaColor(root.colorRole) : elementColors.get(index + 2);
      if (fill) {
        for (const stroke of root.strokes) strokeColors.set(stroke, fill);
      }
    });
    const drawing = paths
      .map(
        (path, i) => `<path d="${escapeXml(path)}" stroke="${strokeColors.get(i) ?? grayStroke}"/>`,
      )
      .join('');

    const hasGlyph = paths.length > 0;
    const labelsX = padding + pinyinWidth + 12;
    const chipsX = labelsX + 40;
    const layouts = rows.map((row) => {
      const groups = [];
      let x = chipsX;
      for (let start = 0; start < row.elements.length; ) {
        const element = row.elements[start];
        const name = strokeSymbols[element.name] ?? element.name;
        let end = start + 1;
        // The color index identifies the root occurrence, even for identical roots.
        while (row.elements[end]?.colorIndex === element.colorIndex) end++;
        const count = end - start;
        const labelWidth = Math.max(
          textWidth(element.label, 12),
          element.paths?.length ? 0 : textWidth(name, 19),
        );
        const keyWidth = Math.max(40, Math.ceil((labelWidth + 12 - (count - 1) * chipGap) / count));
        const spanWidth = count * keyWidth + (count - 1) * chipGap;
        groups.push({ element, name, start, end, x, keyWidth, spanWidth });
        x += spanWidth + chipGap;
        start = end;
      }
      return { row, groups, width: x - chipGap + padding };
    });
    const width = Math.max(hasGlyph ? 224 : 0, ...layouts.map((layout) => layout.width));
    const rowTop = hasGlyph ? 218 : 43;
    const rowHeight = 102;
    const height = rowTop + rows.length * rowHeight + 5;
    function draw(width: number, height: number) {
      const readings = layouts
        .map(({ row, groups }, i) => {
          const y = rowTop + i * rowHeight;
          const chips = [];
          for (const { element, name, start, end, x, spanWidth, keyWidth } of groups) {
            const fill = elementColors.get(element.colorIndex);
            chips.push(
              `<rect x="${x}" y="${y + 9}" width="${spanWidth}" height="42" rx="7" fill="${fill}" fill-opacity=".10"/>` +
                text(x + spanWidth / 2, y + 24, 12, element.label, '#526077', true) +
                (element.paths?.length
                  ? `<svg x="${x}" y="${y + 25}" width="${spanWidth}" height="23" viewBox="0 0 100 100"><title>${escapeXml(name)}</title><g fill="none" stroke="${fill}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">${element.paths.map((path) => `<path d="${escapeXml(path)}"/>`).join('')}</g></svg>`
                  : text(x + spanWidth / 2, y + 43, 19, name, fill, true)),
            );
            for (let column = start; column < end; column++) {
              const keyX = x + (column - start) * (keyWidth + chipGap);
              chips.push(
                `<rect x="${keyX}" y="${y + 57}" width="${keyWidth}" height="35" rx="7" fill="${fill}"/>` +
                  text(keyX + keyWidth / 2, y + 82, 23, row.elements[column].key, '#fff', true),
              );
            }
          }
          return (
            `<path d="M${padding} ${y}H${width - padding}" stroke="#e1e7ef"/>` +
            text(padding, y + 57, 19, row.pinyin) +
            text(labelsX, y + 37, 14, '元素') +
            text(labelsX, y + 80, 14, '全码') +
            chips.join('')
          );
        })
        .join('');
      return `<rect width="${width}" height="${height}" rx="14" fill="#fff"/>
        ${
          hasGlyph
            ? `<g transform="translate(${(width - 184) / 2} 17) scale(1.84)" fill="none" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round">${drawing}</g>`
            : text(padding, 30, 22, character)
        }
        ${readings}`;
    }

    return { width, height, draw };
  }

  function svg(character: string, scheme: Scheme = '键道'): string | null {
    const item = panel(character, scheme);
    return item ? composePanels([item], scheme) : null;
  }

  function png(character: string, scheme: Scheme = '键道'): Buffer | null {
    if (!isSingleHanzi(character)) return null;
    syncBeta(scheme);
    const cacheKey = `${scheme}:${character}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;
    const source = svg(character, scheme);
    if (!source) return null;
    const buffer = renderPng(source);
    const oldest = cache.keys().next().value;
    if (cache.size >= 128 && oldest !== undefined) cache.delete(oldest);
    cache.set(cacheKey, buffer);
    return buffer;
  }

  function pngMany(characters: readonly string[], scheme: Scheme = '键道') {
    if (characters.length === 1) {
      const buffer = png(characters[0], scheme);
      return { buffer, missing: buffer ? [] : [...characters] };
    }
    const missing: string[] = [];
    const panels = [];
    for (const character of characters) {
      const item = panel(character, scheme);
      if (item) panels.push(item);
      else missing.push(character);
    }
    if (!panels.length) return { buffer: null, missing };
    const source = composePanels(panels, scheme);
    return { buffer: renderPng(source), missing };
  }

  return { svg, png, pngMany };
}
