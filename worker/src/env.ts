import type { AisHub } from './aishub';
import type { Vault } from './vault';

export interface Env {
  VAULT: DurableObjectNamespace<Vault>;
  AIS: DurableObjectNamespace<AisHub>;
  /** Long random token for machine-to-proxy writes (AIS snapshots, portfolio fallback). */
  ADMIN_TOKEN?: string;
  ALLOWED_ORIGINS: string;
  /** "Name email" for the SEC User-Agent header (set as a Worker var by the owner). */
  SEC_USER_AGENT?: string;
  SETUP_SECRET?: string;
  KEY_ENCRYPTION_KEY?: string;
  // Dashboard-set provider keys (optional; take priority over app-saved keys).
  [key: string]: unknown;
}
