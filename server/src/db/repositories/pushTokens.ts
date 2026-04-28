/**
 * Push Tokens Repository — Expo push registrations for the OpenNova
 * mobile app. Used by `notifications/dispatcher.ts` to look up the
 * tokens that should receive a given event.
 */
import { db } from '../database.js';

export interface PushTokenRow {
  token: string;
  sn: string;
  user_id: string;
  platform: string;
  created_at: string;
  updated_at: string;
}

class PushTokensRepository {
  private _upsert = db.prepare(`
    INSERT INTO push_tokens (token, sn, user_id, platform, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(token, sn) DO UPDATE SET
      user_id    = excluded.user_id,
      platform   = excluded.platform,
      updated_at = datetime('now')
  `);

  private _findBySn = db.prepare(
    'SELECT * FROM push_tokens WHERE sn = ? ORDER BY updated_at DESC'
  );

  private _deleteToken = db.prepare(
    'DELETE FROM push_tokens WHERE token = ?'
  );

  private _deleteByUser = db.prepare(
    'DELETE FROM push_tokens WHERE user_id = ?'
  );

  upsert(token: string, sn: string, userId: string, platform: string): void {
    this._upsert.run(token, sn, userId, platform);
  }

  findBySn(sn: string): PushTokenRow[] {
    return this._findBySn.all(sn) as PushTokenRow[];
  }

  /** Delete a token across all SNs — called when Expo reports
   *  DeviceNotRegistered for that token. */
  removeToken(token: string): void {
    this._deleteToken.run(token);
  }

  removeByUserId(userId: string): void {
    this._deleteByUser.run(userId);
  }
}

export const pushTokensRepo = new PushTokensRepository();
