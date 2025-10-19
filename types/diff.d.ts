declare module 'diff' {
  export interface DiffPart {
    added?: boolean;
    removed?: boolean;
    value: string;
  }

  export function diffLines(oldStr: string, newStr: string): DiffPart[];
}
