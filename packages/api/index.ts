// loot-core types
import type { InitConfig } from 'loot-core/server/main';

// oxlint-disable-next-line typescript/ban-ts-comment
// @ts-ignore: bundle not available until we build it
import * as bundle from './app/bundle.api.js';
import * as injected from './injected';
import { validateNodeVersion } from './validateNodeVersion';

let actualApp: null | typeof bundle.lib;
export const internal = bundle.lib;

export * from './methods';
export * as utils from './utils';

/** Initializes the Actual Budget API. Must be called before any other API method. */
export async function init(config: InitConfig = {}) {
  if (actualApp) {
    return;
  }

  validateNodeVersion();

  await bundle.init(config);
  actualApp = bundle.lib;

  injected.override(bundle.lib.send);
  return bundle.lib;
}

/** Syncs data and closes the current budget. Call when done using the API. */
export async function shutdown() {
  if (actualApp) {
    try {
      await actualApp.send('sync');
    } catch {
      // most likely that no budget is loaded, so the sync failed
    }
    await actualApp.send('close-budget');
    actualApp = null;
  }
}
