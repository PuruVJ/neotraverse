type TraverseOptions = {
    immutable?: boolean;
    includeSymbols?: boolean;
};
interface TraverseContext {
    /**
     * The present node on the recursive walk
     */
    node: any;
    /**
     * An array of string keys from the root to the present node
     */
    path: string[];
    /**
     * The context of the node's parent.
     * This is `undefined` for the root node.
     */
    parent: TraverseContext | undefined;
    /**
     * The contexts of the node's parents.
     */
    parents: TraverseContext[];
    /**
     * The name of the key of the present node in its parent.
     * This is `undefined` for the root node.
     */
    key: string | undefined;
    /**
     * Whether the present node is the root node
     */
    isRoot: boolean;
    /**
     * Whether the present node is not the root node
     */
    notRoot: boolean;
    /**
     * Whether or not the present node is a leaf node (has no children)
     */
    isLeaf: boolean;
    /**
     * Whether or not the present node is not a leaf node (has children)
     */
    notLeaf: boolean;
    /**
     * Depth of the node within the traversal
     */
    level: number;
    /**
     * If the node equals one of its parents, the `circular` attribute is set to the context of that parent and the traversal progresses no deeper.
     */
    circular?: TraverseContext | null;
    /**
     * Set a new value for the present node.
     *
     * All the elements in `value` will be recursively traversed unless `stopHere` is true (false by default).
     */
    update(value: any, stopHere?: boolean): void;
    /**
     * Remove the current element from the output. If the node is in an Array it will be spliced off. Otherwise it will be deleted from its parent.
     */
    remove(stopHere?: boolean): void;
    /**
     * Delete the current element from its parent in the output. Calls `delete` even on Arrays.
     */
    delete(stopHere?: boolean): void;
    /**
     * Object keys of the node.
     */
    keys: string[] | null;
    /**
     * Call this function before all of the children are traversed.
     * You can assign into `this.keys` here to traverse in a custom order.
     */
    before(callback: (this: TraverseContext, value: any) => void): void;
    /**
     * Call this function after all of the children are traversed.
     */
    after(callback: (this: TraverseContext, value: any) => void): void;
    /**
     * Call this function before each of the children are traversed.
     */
    pre(callback: (this: TraverseContext, child: any, key: any) => void): void;
    /**
     * Call this function after each of the children are traversed.
     */
    post(callback: (this: TraverseContext, child: any) => void): void;
    /**
     * Stops traversal entirely.
     */
    stop(): void;
    /**
     * Prevents traversing descendents of the current node.
     */
    block(): void;
}
declare class Traverse<T extends any> {
    #private;
    constructor(obj: T, options?: TraverseOptions);
    /**
     * Get the element at the array `path`.
     */
    get(paths: string[]): T | undefined;
    has(paths: string[]): boolean;
    set(paths: string[], value: T): T;
    map(cb: (this: TraverseContext, v: any) => any): any;
    forEach(cb: (this: TraverseContext, v: any) => void): any;
    reduce(cb: (this: TraverseContext, acc: any, v: any) => void, init?: T): T;
    paths(): string[][];
    /**
     * Return an `Array` of every node in the object.
     */
    nodes(): any[];
    clone(): any;
}

export { Traverse };
