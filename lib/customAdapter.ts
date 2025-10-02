import { SurrealDBAdapter } from "@auth/surrealdb-adapter";
import type { Adapter, AdapterUser, AdapterAccount } from "next-auth/adapters";
import { RecordId } from "surrealdb";
import { getSurreal } from "@/lib/surrealdb";

type SurrealQueryResult<T = unknown> = T[];

function parseUserRecordId(id: string): RecordId<"user"> {
  const actualId = id.includes(":") ? id.split(":")[1].replace(/[⟨⟩]/g, "") : id;
  return new RecordId("user", actualId);
}

export function CarCloutSurrealAdapter(): Adapter {
  const base = SurrealDBAdapter(getSurreal());
  return {
    ...base,
    createUser: async (user) => {
      const db = await getSurreal();
      const name = user.name || user.email?.split("@")[0] || "User";
      const doc = await db.create("user", {
        ...user,
        name,
        role: "user",
        plan: null,
        xp: 0,
        created_at: new Date().toISOString(),
      });
      const created = Array.isArray(doc) ? (doc[0] as unknown) : (doc as unknown);
      const createdUser = created as { id: { id?: unknown } | string; email?: unknown; emailVerified?: unknown; name?: unknown; image?: unknown };
      const idStr = typeof createdUser.id === 'object' && createdUser?.id && typeof (createdUser.id as { id?: unknown }).id === 'string'
        ? String((createdUser.id as { id?: unknown }).id)
        : String(createdUser.id as string);
      const out: AdapterUser = {
        id: idStr,
        email: typeof createdUser.email === 'string' ? createdUser.email : '',
        emailVerified: createdUser.emailVerified ? new Date(String(createdUser.emailVerified)) : null,
        name: typeof createdUser.name === 'string' ? createdUser.name : null,
        image: typeof createdUser.image === 'string' ? createdUser.image : null,
      };
      return out;
    },
    linkAccount: async (account: AdapterAccount) => {
      if (typeof base.linkAccount === "function") {
        const linked = await base.linkAccount(account);
        try {
          const db = await getSurreal();
          const uid = typeof account.userId === "string" ? account.userId : "";
          await db.query<SurrealQueryResult>(`UPDATE $rid SET provider = $provider`, {
            rid: parseUserRecordId(uid),
            provider: account.provider,
          });
        } catch {}
        return linked as AdapterAccount;
      }
      return account;
    },
  };
}


