import 'winston-daily-rotate-file';

import * as winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  transports: [new winston.transports.Console()],
  format: winston.format.combine(
    ...(Object.prototype.hasOwnProperty.call(process.env, 'NO_COLOR')
      ? []
      : [winston.format.colorize()]),
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length
        ? ' ' + JSON.stringify(meta)
        : '';
      return `${timestamp} ${level}: ${message}${metaStr}`;
    }),
  ),
});

if (process.env.NODE_ENV !== 'test') {
  logger.add(
    new winston.transports.DailyRotateFile({
      dirname: process.env.LOG_DIR ?? '/data/logs',
      filename: 'actual-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxFiles: '30d',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
      ),
    }),
  );
}

export default logger;
