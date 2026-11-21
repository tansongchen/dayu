import type { QQBot, QQBotInboundMessage } from '@tencent-connect/qqbot-nodejs';
import type { createGlyphRenderer } from './glyph.ts';
import { type Scheme, schemeNames } from './scheme.ts';

const maxCharacters = 10;

export function getMessageQuery(
  message: QQBotInboundMessage,
  appId: string,
): { scheme: Scheme; characters: string[]; truncated: boolean } | null {
  if (
    (message.kind !== 'group' && message.kind !== 'c2c') ||
    message.senderIsBot ||
    message.attachments?.length
  )
    return null;
  if (typeof message.content !== 'string') return null;
  let text = message.content.trim();
  if (message.kind === 'group') {
    // Remove only this bot's mention. Mentions of other members remain non-matches.
    const selfIds = new Set([appId]);
    for (const mention of message.mentions ?? []) {
      if (mention.is_you) {
        for (const id of [mention.id, mention.user_openid, mention.member_openid]) {
          if (id) selfIds.add(id);
        }
      }
    }
    for (const id of selfIds) {
      for (const marker of [`<@${id}>`, `<@!${id}>`]) {
        if (text.startsWith(marker)) text = text.slice(marker.length).trim();
      }
    }
  }
  if (/<@!?[^>]+>/u.test(text)) return null;
  const [, scheme, content] = /^(键道|四拼|飞花beta)\s+([\s\S]+)$/u.exec(text) ?? [];
  if (!scheme || !content) return null;
  const characters = [...content.replace(/\s/gu, '')];
  return {
    scheme: scheme as Scheme,
    characters: characters.slice(0, maxCharacters),
    truncated: characters.length > maxCharacters,
  };
}

export function createMessageHandler({
  bot,
  renderer,
  logger = console,
}: {
  bot: Pick<QQBot, 'appId' | 'sendImage' | 'sendText'>;
  renderer: Pick<ReturnType<typeof createGlyphRenderer>, 'pngMany'>;
  logger?: Pick<Console, 'error'>;
}) {
  const seen = new Map<string, number>();
  return async (_ctx: unknown, message: QQBotInboundMessage): Promise<void> => {
    const query = getMessageQuery(message, bot.appId);
    const target = message.replyTarget;
    if (!query || target?.scope !== message.kind || !target.targetId || !target.msgId) return;
    const { scheme, characters, truncated } = query;
    const key = `${target.scope}:${target.targetId}:${target.msgId}`;
    const now = Date.now();
    for (const [id, timestamp] of seen) {
      if (now - timestamp < 300_000) break;
      seen.delete(id);
    }
    if (seen.has(key)) return;
    const oldest = seen.keys().next().value;
    if (seen.size >= 1000 && oldest !== undefined) seen.delete(oldest);
    seen.set(key, now);
    try {
      const { buffer, missing } = renderer.pngMany(characters, scheme);
      const warnings: string[] = [];
      if (truncated) warnings.push(`字数超过 ${maxCharacters}，仅处理前 ${maxCharacters} 个字。`);
      if (missing.length)
        warnings.push(
          `${schemeNames[scheme]}暂未收录「${[...new Set(missing)].join('')}」，已跳过。`,
        );
      const content = warnings.join('\n');
      if (!buffer) {
        await bot.sendText(target, content);
        return;
      }
      await bot.sendImage(target, { buffer }, content ? { content } : undefined);
    } catch (error) {
      logger.error(
        `[snow-xiaoyu] 回复「${characters.join('')}」失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };
}
