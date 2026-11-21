import { QQBot } from '@tencent-connect/qqbot-nodejs';
import { createMessageHandler } from './bot.ts';
import { createGlyphRenderer } from './glyph.ts';

async function main() {
  const renderer = createGlyphRenderer();
  if (process.argv.includes('--check')) {
    for (const [scheme, character] of [
      ['键道', '键'],
      ['键道', '咸'],
      ['四拼', '雪'],
      ['四拼', '重'],
      ['飞花beta', '营'],
      ['飞花beta', '功'],
      ['飞花beta', '日'],
      ['飞花beta', '重'],
    ] as const) {
      const png = renderer.png(character, scheme);
      if (!png?.length) throw new Error(`渲染失败: ${scheme} ${character}`);
      console.log(`${scheme} ${character}: PNG ${png.length} bytes`);
    }
    for (const scheme of ['键道', '四拼', '飞花beta'] as const) {
      const { buffer, missing } = renderer.pngMany(['营', '𰻞', '重', '营'], scheme);
      if (!buffer?.length || !missing.includes('𰻞')) throw new Error(`多字渲染失败: ${scheme}`);
      console.log(`${scheme} 多字: PNG ${buffer.length} bytes，跳过 ${missing.join('')}`);
    }
    console.log('snow-xiaoyu: 键道、四拼与飞花 beta 单字及多字渲染检查通过（未连接 QQ）');
    return;
  }
  function required(key: string): string {
    const value = process.env[key]?.trim();
    if (!value) throw new Error(`请在 .env 中填写 ${key}`);
    return value;
  }
  const bot = new QQBot({
    appId: required('XIAOYU_QQ_APP_ID'),
    appSecret: required('XIAOYU_QQ_APP_SECRET'),
    accountId: 'snow-xiaoyu',
    intents: 1 << 25, // QQ group and C2C events.
    logger: console,
    reconnect: { maxAttempts: 10 },
  });
  bot.on('message', createMessageHandler({ bot, renderer }));
  bot.on('ready', () => console.log('[snow-xiaoyu] Bot ready!'));
  bot.on('error', (error) => console.error(`[snow-xiaoyu] ${error.message}`));
  const stop = () => bot.stop();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    await bot.start();
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }
}

main().catch((error) => {
  console.error(`[snow-xiaoyu] ${error.message}`);
  process.exitCode = 1;
});
