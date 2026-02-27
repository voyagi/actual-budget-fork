import { join, resolve } from 'node:path';

import { config } from '../load-config';

export function getPathForUserFile(fileId: string): string {
  return join(resolve(config.get('userFiles')), `file-${fileId}.blob`);
}

export function getPathForGroupFile(groupId: string): string {
  return join(resolve(config.get('userFiles')), `group-${groupId}.sqlite`);
}
