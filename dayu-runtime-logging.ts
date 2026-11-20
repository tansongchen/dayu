import { type Context, type Exporter, Logger } from '@deepseek-ai/cordis';

export const name = 'dayu-runtime-logging';

export function apply(ctx: Context): void {
  const sink: Exporter = {
    colors: false,
    levels: { default: 2 },
    export(message) {
      if (message.type !== 'warn' && message.type !== 'error') return;
      process.stderr.write(
        `${new Date(message.ts).toISOString()} [${message.type}] [${message.name}] ${Logger.format(sink, message)}\n`,
      );
    },
  };
  for (const message of [...ctx.logger.buffer]) sink.export(message);
  ctx.logger.exporter(sink);
  process.stderr.write(
    `${new Date().toISOString()} [dayu-runtime-logging] warning/error logging enabled\n`,
  );
}
