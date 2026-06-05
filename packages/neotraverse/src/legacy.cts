import traverse from './index';

export { default } from './index';
export type { TraverseContext, TraverseOptions } from './index';

// @ts-expect-error
module.exports = traverse;
