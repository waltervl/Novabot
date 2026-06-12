import {
  execFile as nodeExecFile,
  type ExecFileException,
} from 'node:child_process';

export interface CoverageNativePoint {
  x: number;
  y: number;
}

export interface CoverageNativeWorld {
  width: number;
  height: number;
  resolution: number;
  originX: number;
  originY: number;
  areaId?: number;
}

export interface CoverageNativeRequest {
  pgmPath: string;
  start: CoverageNativePoint;
  covDir?: number;
  world?: CoverageNativeWorld;
}

export type CoverageNativeJson = Record<string, string | Record<string, string>>;

export interface CoverageNativeExecOptions {
  timeout: number;
  maxBuffer: number;
  encoding: 'utf8';
}

export type CoverageNativeExecFile = (
  file: string,
  args: string[],
  options: CoverageNativeExecOptions,
  callback: (
    error: ExecFileException | null,
    stdout: string,
    stderr: string,
  ) => void,
) => void;

export interface GenerateCoverageNativeOptions extends CoverageNativeRequest {
  binaryPath?: string;
  timeoutMs?: number;
  execFile?: CoverageNativeExecFile;
}

const DEFAULT_COVERAGE_NATIVE_BIN = '/opt/opennova/bin/coverage_grid_plan';
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_BUFFER_BYTES = 32 * 1024 * 1024;

export function coverageNativeBinaryPath(): string {
  return process.env.COVERAGE_NATIVE_BIN || DEFAULT_COVERAGE_NATIVE_BIN;
}

export function buildCoverageNativeArgs(req: CoverageNativeRequest): string[] {
  const args = [
    req.pgmPath,
    String(req.start.x),
    String(req.start.y),
  ];

  if (req.covDir !== undefined) {
    args.push(String(req.covDir));
  }

  if (req.world) {
    args.push(
      '--world',
      String(req.world.width),
      String(req.world.height),
      String(req.world.resolution),
      String(req.world.originX),
      String(req.world.originY),
    );
    if (req.world.areaId !== undefined) {
      args.push(String(req.world.areaId));
    }
  }

  return args;
}

export async function generateCoveragePlanWithNative(
  opts: GenerateCoverageNativeOptions,
): Promise<CoverageNativeJson> {
  const binary = opts.binaryPath ?? coverageNativeBinaryPath();
  const args = buildCoverageNativeArgs(opts);
  const execFile =
    opts.execFile ?? (nodeExecFile as unknown as CoverageNativeExecFile);

  return new Promise((resolve, reject) => {
    execFile(
      binary,
      args,
      {
        timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        maxBuffer: DEFAULT_MAX_BUFFER_BYTES,
        encoding: 'utf8',
      },
      (error, stdout, stderr) => {
        if (error) {
          const detail = stderr.trim() || error.message;
          reject(new Error(`coverage native failed: ${detail}`));
          return;
        }

        try {
          resolve(JSON.parse(stdout) as CoverageNativeJson);
        } catch (parseError) {
          const detail =
            parseError instanceof Error ? parseError.message : String(parseError);
          reject(new Error(`coverage native returned invalid JSON: ${detail}`));
        }
      },
    );
  });
}
