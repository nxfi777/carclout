import { RecordId } from "surrealdb";

export type UserId = RecordId<"user"> | string;

export interface UserDoc {
  id: RecordId<"user">;
  email: string;
  name?: string;
  image?: string | null;
  role?: "admin" | "user";
  plan?: "base" | "premium" | "ultra" | null;
  xp?: number;
  created_at?: string;
  auto_reload_enabled?: boolean;
  auto_reload_threshold?: number; // credits balance threshold to trigger reload
  auto_reload_amount?: number; // USD amount to reload
}


