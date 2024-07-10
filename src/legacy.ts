import { Traverse, type TraverseContext, type TraverseOptions } from './index.ts';

const traverse = (obj: any, options?: TraverseOptions): Traverse => {
	return new Traverse(obj, options);
};

export default traverse;
export type { TraverseContext, TraverseOptions };
