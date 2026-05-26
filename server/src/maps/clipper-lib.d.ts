declare module 'clipper-lib' {
  export interface IntPoint { X: number; Y: number; }
  export const JoinType: { jtSquare: number; jtRound: number; jtMiter: number };
  export const EndType: {
    etOpenSquare: number; etOpenRound: number; etOpenButt: number;
    etClosedLine: number; etClosedPolygon: number;
  };
  export class ClipperOffset {
    constructor(miterLimit?: number, arcTolerance?: number);
    AddPath(path: IntPoint[], joinType: number, endType: number): void;
    AddPaths(paths: IntPoint[][], joinType: number, endType: number): void;
    Execute(solution: IntPoint[][], delta: number): void;
    Clear(): void;
  }
  export const Clipper: { Area(path: IntPoint[]): number };
  export class Paths extends Array<IntPoint[]> {}
  const _default: {
    JoinType: typeof JoinType; EndType: typeof EndType;
    ClipperOffset: typeof ClipperOffset; Clipper: typeof Clipper; Paths: typeof Paths;
  };
  export default _default;
}
