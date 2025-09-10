import { type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { RecordId } from "surrealdb";

export function cn(...inputs: ClassValue[]) {
  return twMerge(
    inputs
      .flat()
      .filter(Boolean)
      .map((v) => String(v))
      .join(" ")
  );
}


/**
 * Helper function to ensure we have a RecordId object for the specified table.
 * This is safe to use on both client and server sides.
 */
export function ensureRecordId(id: string | RecordId, tableName: string): RecordId {
  if (id instanceof RecordId) {
    // Already a RecordId - use it directly
    return id;
  }

  // Handle string input - extract clean ID if needed
  let cleanId: string;
  if (typeof id === 'string') {
    if (id.includes(':')) {
      // Extract ID from string format like "table:123"
      const parts = id.split(':');
      cleanId = parts[parts.length - 1];
      // Clean up any special characters (but NOT the letter 'r')
      cleanId = cleanId.replace(/[⟨⟩"]/g, '');
    } else {
      cleanId = id;
    }
  } else if (typeof id === 'object' && id !== null && 'id' in id) {
    // Handle plain objects with tb and id properties like { tb: 'company', id: 'u9yxm9wlm9rqcthraalj' }
    cleanId = String((id as { id: unknown }).id);
    // Clean up any special characters if it came from a RecordId string format
    cleanId = cleanId.replace(/[⟨⟩"]/g, '');
  } else {
    // Convert to string and try to extract
    const idString = String(id);
    if (idString.includes(':')) {
      const parts = idString.split(':');
      cleanId = parts[parts.length - 1];
      cleanId = cleanId.replace(/[⟨⟩"]/g, '');
    } else {
      cleanId = idString;
    }
  }

  return new RecordId(tableName, cleanId);
}