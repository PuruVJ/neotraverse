// The wire layer: plain data and baked page bodies cross, the corpus stays on the server.
import { remotes } from '@ogygia/content/server';
import { docs } from './docs.server';

export const { meta, page } = remotes(docs, { base: '' });
