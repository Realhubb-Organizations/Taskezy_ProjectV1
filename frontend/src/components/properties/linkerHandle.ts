/** Imperative handle the property popup uses to save a linker's pending list. */
export interface LinkerHandle {
  /** Saves pending changes, if any. Resolves false when the save failed (the linker shows the error). */
  save: () => Promise<boolean>;
}

export const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
