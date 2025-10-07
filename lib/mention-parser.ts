/**
 * Parse mentions from chat messages
 * Supports @everyone and @user mentions
 */

export type MentionResult = {
  hasEveryone: boolean;
  mentions: string[]; // Array of mentioned user emails/names
};

/**
 * Extract mentions from message text
 * Matches:
 * - @everyone (admin-only feature)
 * - @username or @user.name or @user-name
 */
export function parseMentions(text: string): MentionResult {
  const hasEveryone = /@everyone\b/i.test(text);
  
  // Match @mentions: @word, @word.word, @word-word, @word_word
  // But not email addresses (must not be preceded by alphanumeric or followed by @)
  const mentionRegex = /(?<![a-zA-Z0-9])@([a-zA-Z0-9._-]+)/g;
  const mentions: string[] = [];
  
  let match;
  while ((match = mentionRegex.exec(text)) !== null) {
    const mention = match[1].toLowerCase();
    // Skip 'everyone' as it's handled separately
    if (mention !== 'everyone' && !mentions.includes(mention)) {
      mentions.push(mention);
    }
  }
  
  return { hasEveryone, mentions };
}

/**
 * Find users by mention text
 * Matches against email prefix (before @) and display name
 */
export function matchUserByMention(
  mention: string,
  userList: Array<{ email?: string; name?: string }>
): string[] {
  const lowerMention = mention.toLowerCase();
  const matched: string[] = [];
  
  for (const user of userList) {
    if (!user.email) continue;
    
    // Match against email prefix
    const emailPrefix = user.email.split('@')[0].toLowerCase();
    if (emailPrefix === lowerMention || emailPrefix.includes(lowerMention)) {
      matched.push(user.email);
      continue;
    }
    
    // Match against display name
    if (user.name) {
      const nameLower = user.name.toLowerCase();
      const nameNormalized = nameLower.replace(/\s+/g, '').replace(/[._-]/g, '');
      const mentionNormalized = lowerMention.replace(/[._-]/g, '');
      
      if (nameLower === lowerMention || 
          nameNormalized === mentionNormalized ||
          nameLower.includes(lowerMention)) {
        matched.push(user.email);
      }
    }
  }
  
  return matched;
}

