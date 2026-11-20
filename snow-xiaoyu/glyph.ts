import { Resvg } from '@resvg/resvg-js';
import { createKeytaoLookup } from './keytao.ts';
import { createSnow4Lookup, type Scheme, schemeNames } from './scheme.ts';

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

const rainbow = ['#b7353b', '#b25716', '#8f6c08', '#287745', '#2368a5', '#713eaa'];
const grayStroke = '#a4aab3';
const chipWidth = 65;
const columnPitch = 73;

export function createGlyphRenderer() {
  const createLookup = { 键道: createKeytaoLookup, 四拼: createSnow4Lookup };
  const lookups: Partial<Record<Scheme, ReturnType<(typeof createLookup)[Scheme]>>> = {};
  const cache = new Map<string, Buffer>();

  function svg(character: string, scheme: Scheme = '键道'): string | null {
    if (!isSingleHanzi(character)) return null;
    lookups[scheme] ??= createLookup[scheme]();
    const result = lookups[scheme](character);
    if (!result) return null;
    const { paths, roots, rows } = result;
    // Assign colors in code order. Repeated keys from one root share its color.
    const usedElements = [
      ...new Set(rows.flatMap((row) => row.elements.map((element) => element.colorIndex))),
    ];
    const elementColors = new Map(usedElements.map((index, i) => [index, rainbow[i]]));
    const strokeColors = new Map<number, string>();
    roots.forEach((root, index) => {
      const fill = elementColors.get(index + 2);
      if (fill) {
        for (const stroke of root.strokes) strokeColors.set(stroke, fill);
      }
    });
    const drawing = paths
      .map((path, i) => `<path d="${path}" stroke="${strokeColors.get(i) ?? grayStroke}"/>`)
      .join('');

    const hasGlyph = paths.length > 0;
    const width = hasGlyph
      ? 640
      : 202 + columnPitch * Math.max(...rows.map((row) => row.elements.length));
    const rowTop = hasGlyph ? 309 : 72;
    const rowHeight = 117;
    const height = rowTop + rows.length * rowHeight + 16;
    const text = (
      x: number,
      y: number,
      size: number,
      value: string,
      fill = '#243148',
      center = false,
    ) =>
      `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}"${center ? ' text-anchor="middle"' : ''}>${escapeXml(value)}</text>`;
    const readings = rows
      .map((row, i) => {
        const y = rowTop + i * rowHeight;
        const chips: string[] = [];
        for (let start = 0; start < row.elements.length; ) {
          const element = row.elements[start];
          let end = start + 1;
          // The color index identifies the root occurrence, even for identical roots.
          while (row.elements[end]?.colorIndex === element.colorIndex) end++;
          const x = 166 + start * columnPitch;
          const fill = elementColors.get(element.colorIndex);
          const spanWidth = chipWidth + (end - start - 1) * columnPitch;
          chips.push(
            `<rect x="${x}" y="${y + 12}" width="${spanWidth}" height="42" rx="7" fill="${fill}" fill-opacity=".10"/>` +
              text(x + spanWidth / 2, y + 27, 12, element.label, '#526077', true) +
              text(x + spanWidth / 2, y + 46, 19, element.name, fill, true),
          );
          for (let column = start; column < end; column++) {
            const keyX = 166 + column * columnPitch;
            chips.push(
              `<rect x="${keyX}" y="${y + 62}" width="${chipWidth}" height="37" rx="7" fill="${fill}"/>` +
                text(keyX + chipWidth / 2, y + 88, 23, row.elements[column].key, '#fff', true),
            );
          }
          start = end;
        }
        return (
          `<path d="M35 ${y}H${width - 35}" stroke="#e1e7ef"/>` +
          text(67, y + 62, 22, row.pinyin, '#243148', true) +
          text(119, y + 39, 15, '元素') +
          text(119, y + 86, 15, '全码') +
          chips.join('')
        );
      })
      .join('');
    const font = process.platform === 'darwin' ? 'Hiragino Sans GB' : 'Noto Sans CJK SC';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="${width}" height="${height}" fill="#eef2f7"/>
      <rect x="14" y="14" width="${width - 28}" height="${height - 28}" rx="19" fill="#fff"/>
      <g font-family="${font}, sans-serif">
        ${text(35, 54, 22, `${schemeNames[scheme]} · ${hasGlyph ? '字形' : character}`)}
        ${hasGlyph ? `<g transform="translate(205 60) scale(2.3)" fill="none" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round">${drawing}</g>` : ''}
        ${readings}
      </g>
    </svg>`;
  }

  function png(character: string, scheme: Scheme = '键道'): Buffer | null {
    const cacheKey = `${scheme}:${character}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;
    const source = svg(character, scheme);
    if (!source) return null;
    const buffer = Buffer.from(new Resvg(source).render().asPng());
    const oldest = cache.keys().next().value;
    if (cache.size >= 128 && oldest !== undefined) cache.delete(oldest);
    cache.set(cacheKey, buffer);
    return buffer;
  }

  return { svg, png };
}
