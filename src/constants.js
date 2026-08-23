export const TEXT_MAX_BYTES = 10240;
export const BOX_NAME_MAX = 40;
export const SPACE_NAME_MAX = 40;
export const SPACE_CODE_MIN = 4;
export const SPACE_CODE_MAX = 24;
export const SPACE_PASSWORD_MIN = 6;

export const AUTOSAVE_DELAY_MS = 700;
export const TOAST_DURATION_MS = 2600;
export const HEARTBEAT_INTERVAL_MS = 25000;
export const RECONNECT_BASE_MS = 1000;
export const RECONNECT_MAX_MS = 20000;
export const TOKEN_REFRESH_MARGIN_S = 90;

export const FILE_RETENTION_DAYS = 7;

export const STORAGE_KEYS = {
  session: "butbox.session",
  pkceVerifier: "butbox.pkce",
  lastSpaceId: "butbox.lastSpace"
};

export const UPGRADE_LEVERS = {
  boxLimit: "box_limit",
  spaceQuota: "space_quota",
  spaceLimit: "space_limit",
  fileUpload: "file_upload"
};
