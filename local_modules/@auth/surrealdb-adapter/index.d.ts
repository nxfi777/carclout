/**
 * <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", padding: 16}}>
 *  <p>Official <a href="https://www.surrealdb.com">SurrealDB</a> adapter for Auth.js / NextAuth.js.</p>
 *  <a href="https://www.surrealdb.com">
 *   <img style={{display: "block"}} src="https://authjs.dev/img/adapters/surrealdb.svg" width="30" />
 *  </a>
 * </div>
 *
 * ## Installation
 *
 * ```bash npm2yarn
 * npm install @auth/surrealdb-adapter surrealdb
 * ```
 *
 * @module @auth/surrealdb-adapter
 */
import { Surreal, RecordId } from "surrealdb";
import type { Adapter } from "@auth/core/adapters";
import type { ProviderType } from "@auth/core/providers";

type Document = Record<string, unknown> & { id: RecordId<string> };

export type UserDoc = Document & { 
  email: string;
  emailVerified?: string | null;
};

export type AccountDoc = Document & {
  userId: RecordId<"user">;
  refresh_token?: string;
  access_token?: string;
  type: Extract<ProviderType, "oauth" | "oidc" | "email" | "webauthn">;
  provider: string;
  providerAccountId: string;
  expires_at?: number;
};

export type SessionDoc = Document & { 
  userId: RecordId<"user">;
  expires?: string;
  sessionToken?: string;
};

export type VerificationTokenDoc = Document & {
  identifier: string;
  token: string;
  expires: string;
};

export declare function SurrealDBAdapter(client: Promise<Surreal>): Adapter;

export {};
//# sourceMappingURL=index.d.ts.map