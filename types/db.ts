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
}


