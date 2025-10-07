import React from "react";

/**
 * Highlight @mentions and @everyone in message text
 */
export function HighlightMentions({ text, currentUserEmail }: { text: string; currentUserEmail?: string | null }) {
  // Pattern to match @mentions (including @everyone)
  const mentionRegex = /(^|[^a-zA-Z0-9])(@[a-zA-Z0-9._-]+)/g;
  
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  
  while ((match = mentionRegex.exec(text)) !== null) {
    const prefix = match[1]; // Non-word character before @
    const mention = match[2]; // @mention text
    const matchStart = match.index;
    const mentionStart = matchStart + prefix.length;
    
    // Add text before mention
    if (lastIndex < mentionStart) {
      parts.push(text.substring(lastIndex, mentionStart));
    }
    
    // Add the prefix
    parts.push(prefix);
    
    // Check if it's @everyone or a user mention
    const isEveryone = mention.toLowerCase() === '@everyone';
    const mentionLower = mention.toLowerCase();
    const emailPrefix = currentUserEmail?.split('@')[0].toLowerCase();
    const isSelfMention = emailPrefix && mentionLower === `@${emailPrefix}`;
    
    // Highlight the mention
    parts.push(
      <span
        key={matchStart}
        className={
          isEveryone
            ? "bg-orange-500/20 text-orange-400 px-1 rounded font-medium"
            : isSelfMention
            ? "bg-blue-500/20 text-blue-400 px-1 rounded font-medium"
            : "bg-purple-500/20 text-purple-400 px-1 rounded font-medium"
        }
      >
        {mention}
      </span>
    );
    
    lastIndex = mentionStart + mention.length;
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }
  
  return <>{parts.length > 0 ? parts : text}</>;
}

