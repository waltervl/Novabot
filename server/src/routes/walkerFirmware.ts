import { otaVersionRepo, type OtaVersionRow } from '../db/repositories/otaVersions.js';

export interface WalkerFirmwareLatestResponse {
  ok: true;
  updateAvailable: boolean;
  version: string;
  url: string;
  md5: string;
  sha256?: string;
  size?: number;
  signature?: string;
  keyId?: string;
  signingKeyId?: string;
  releaseNotes?: string;
  reason?: string;
}

function isHex(value: string | null | undefined, len: number): value is string {
  return typeof value === 'string' && new RegExp(`^[0-9a-fA-F]{${len}}$`).test(value);
}

function hasSignedWalkerFields(row: OtaVersionRow): boolean {
  return isHex(row.md5, 32)
    && isHex(row.sha256, 64)
    && typeof row.size === 'number'
    && row.size > 0
    && typeof row.signature === 'string'
    && row.signature.trim().length > 0;
}

function emptyResponse(reason?: string): WalkerFirmwareLatestResponse {
  return {
    ok: true,
    updateAvailable: false,
    version: '',
    url: '',
    md5: '',
    ...(reason ? { reason } : {}),
  };
}

export function buildWalkerFirmwareLatestResponse(
  currentVersion: string,
  baseUrl: string,
): WalkerFirmwareLatestResponse {
  const latest = otaVersionRepo.findLatestByDeviceType('walker');
  if (!latest) return emptyResponse();

  const updateAvailable = latest.version > currentVersion;
  if (updateAvailable && !hasSignedWalkerFields(latest)) {
    return {
      ok: true,
      updateAvailable: false,
      version: latest.version,
      url: '',
      md5: latest.md5 ?? '',
      releaseNotes: latest.release_notes ?? '',
      reason: 'latest walker firmware is unsigned; update not offered',
    };
  }

  const filename = (latest.download_url ?? '').split('/').pop() ?? '';
  const signingKeyId = latest.signing_key_id ?? undefined;
  return {
    ok: true,
    updateAvailable,
    version: latest.version,
    url: updateAvailable ? `${baseUrl}/api/walker-firmware/binary/${encodeURIComponent(filename)}` : '',
    md5: latest.md5 ?? '',
    sha256: latest.sha256 ?? undefined,
    size: latest.size ?? undefined,
    signature: latest.signature ?? undefined,
    keyId: signingKeyId,
    signingKeyId,
    releaseNotes: latest.release_notes ?? '',
  };
}
