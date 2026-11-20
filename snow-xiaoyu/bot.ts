import type { QQBot, QQBotInboundMessage } from '@tencent-connect/qqbot-nodejs';
import { isSingleHanzi } from './glyph.ts';
import { type Scheme, schemeNames } from './scheme.ts';

export function getMessageQuery(
  message: QQBotInboundMessage,
  appId: string,
): { scheme: Scheme; character: string } | null {
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
  const [, scheme, character] = /^(键道|四拼)[ \u3000]+(.+)$/u.exec(text) ?? [];
  return scheme && isSingleHanzi(character) ? { scheme: scheme as Scheme, character } : null;
}

export function createMessageHandler({
  bot,
  renderer,
  logger = console,
}: {
  bot: Pick<QQBot, 'appId' | 'sendImage' | 'sendText'>;
  renderer: { png(character: string, scheme: Scheme): Buffer | null };
  logger?: Pick<Console, 'error'>;
}) {
  const seen = new Map<string, number>();
  return async (_ctx: unknown, message: QQBotInboundMessage): Promise<void> => {
    const query = getMessageQuery(message, bot.appId);
    const target = message.replyTarget;
    if (!query || target?.scope !== message.kind || !target.targetId || !target.msgId) return;
    const { scheme, character } = query;
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
      const buffer = renderer.png(character, scheme);
      if (!buffer) {
        await bot.sendText(target, `${schemeNames[scheme]}暂未收录「${character}」的编码。`);
        return;
      }
      await bot.sendImage(target, { buffer });
    } catch (error) {
      logger.error(
        `[snow-xiaoyu] 回复「${character}」失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };
}
