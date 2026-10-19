// Request and response shapes shared by the app and the proxy.

export interface PairResponse {
  token: string;
  deviceId: string;
}

export interface DeviceInfo {
  id: string;
  name: string;
  createdAt: number;
  lastSeen: number;
  current?: boolean;
}

export interface AddDeviceCode {
  code: string;
  expiresAt: number;
}

export interface UsageRow {
  day: string;
  feature: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  usd: number;
  calls: number;
}

export interface ApiError {
  error: string;
}
