import { Surreal, type LiveHandler, type LiveHandlerArguments, type Patch, Uuid } from "surrealdb";

function wrapSubscribeLive(client: Surreal) {
  const original = client.subscribeLive.bind(client);
  client.subscribeLive = (<Result extends Record<string, unknown> | Patch = Record<string, unknown>>(
    queryUuid: Uuid,
    handler: LiveHandler<Result>,
  ): Promise<void> => original(queryUuid, (...args: LiveHandlerArguments<Result>) => {
    handler(...args);
  })) as typeof client.subscribeLive;
}

// Support both Ignite (SURREAL_*) and distrib-forge (AUTH_SURREALDB_*) envs
const rawConnection =
  process.env.SURREAL_URL ||
  process.env.AUTH_SURREALDB_CONNECTION ||
  "ws://127.0.0.1:8000/rpc";
const namespace =
  process.env.SURREAL_NAMESPACE ||
  process.env.AUTH_SURREALDB_NS ||
  "ignite";
const database =
  process.env.SURREAL_DATABASE ||
  process.env.AUTH_SURREALDB_DB ||
  "ignite";
const username =
  process.env.SURREAL_USERNAME ||
  process.env.AUTH_SURREALDB_USERNAME ||
  "root";
const password =
  process.env.SURREAL_PASSWORD ||
  process.env.AUTH_SURREALDB_PASSWORD ||
  "root";

function ensureRpc(url: string) {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (!u.pathname.includes("/rpc")) {
      u.pathname = (u.pathname.endsWith("/") ? u.pathname.slice(0, -1) : u.pathname) + "/rpc";
    }
    return u.toString();
  } catch {
    return url.endsWith("/rpc") ? url : `${url.replace(/\/$/, "")}/rpc`;
  }
}

let client: Surreal | null = null;

export async function getSurreal(): Promise<Surreal> {
  if (client) return client;
  client = new Surreal();
  const url = ensureRpc(rawConnection);
  await client.connect(url, {
    namespace,
    database,
    auth: { username, password },
  });
  await client.ready;
  wrapSubscribeLive(client);
  return client;
}

export type SurrealQueryResult<T> = T[];


