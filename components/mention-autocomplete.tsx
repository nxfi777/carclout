"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { CarFront } from "lucide-react";

type User = {
  email: string;
  name?: string;
  image?: string;
  role?: string;
};

type MentionAutocompleteProps = {
  inputRef: React.RefObject<HTMLTextAreaElement>;
  users: User[];
  isAdmin: boolean;
  onSelect: (mention: string) => void;
};

export function MentionAutocomplete({ inputRef, users, isAdmin, onSelect }: MentionAutocompleteProps) {
  const [visible, setVisible] = useState(false);
  const [suggestions, setSuggestions] = useState<(User | { special: 'everyone' })[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const popupRef = useRef<HTMLDivElement>(null);

  const selectSuggestion = useCallback((suggestion: User | { special: 'everyone' }) => {
    const textarea = inputRef.current;
    if (!textarea) return;
    
    const text = textarea.value;
    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = text.substring(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    
    if (lastAtIndex === -1) return;
    
    const mention = 'special' in suggestion 
      ? 'everyone' 
      : (suggestion.name?.replace(/\s+/g, '') || suggestion.email.split('@')[0]);
    
    const before = text.substring(0, lastAtIndex);
    const after = text.substring(cursorPos);
    const newText = `${before}@${mention} ${after}`;
    
    textarea.value = newText;
    const newCursorPos = lastAtIndex + mention.length + 2; // +2 for @ and space
    textarea.setSelectionRange(newCursorPos, newCursorPos);
    textarea.focus();
    
    setVisible(false);
    onSelect(`@${mention}`);
  }, [inputRef, onSelect]);

  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;

    const handleInput = () => {
      const text = textarea.value;
      const cursorPos = textarea.selectionStart;
      
      // Find the last @ before cursor
      const textBeforeCursor = text.substring(0, cursorPos);
      const lastAtIndex = textBeforeCursor.lastIndexOf('@');
      
      if (lastAtIndex === -1) {
        setVisible(false);
        return;
      }
      
      // Check if there's a space between @ and cursor
      const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
      if (/\s/.test(textAfterAt)) {
        setVisible(false);
        return;
      }
      
      // Get the mention query
      const query = textAfterAt.toLowerCase();
      
      // Build suggestions
      const matches: (User | { special: 'everyone' })[] = [];
      
      // Add @everyone if admin and matches query
      if (isAdmin && 'everyone'.startsWith(query)) {
        matches.push({ special: 'everyone' });
      }
      
      // Add user matches
      for (const user of users) {
        const emailPrefix = user.email.split('@')[0].toLowerCase();
        const nameLower = user.name?.toLowerCase() || '';
        
        if (emailPrefix.startsWith(query) || nameLower.includes(query)) {
          matches.push(user);
        }
        
        if (matches.length >= 5) break;
      }
      
      if (matches.length > 0) {
        setSuggestions(matches);
        setSelectedIndex(0);
        setVisible(true);
      } else {
        setVisible(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!visible) return;
      
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % suggestions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (suggestions[selectedIndex]) {
          e.preventDefault();
          selectSuggestion(suggestions[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        setVisible(false);
      }
    };

    textarea.addEventListener('input', handleInput);
    textarea.addEventListener('keydown', handleKeyDown);
    
    return () => {
      textarea.removeEventListener('input', handleInput);
      textarea.removeEventListener('keydown', handleKeyDown);
    };
  }, [inputRef, users, isAdmin, visible, suggestions, selectedIndex, selectSuggestion]);

  if (!visible) return null;

  return (
    <div
      ref={popupRef}
      className="fixed z-5 bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-lg overflow-hidden"
      style={{
        maxWidth: '16rem',
        width: 'max-content',
      }}
    >
      <div className="max-h-60 overflow-y-auto">
        {suggestions.map((suggestion, index) => {
          const isEveryone = 'special' in suggestion;
          const user = isEveryone ? null : suggestion;
          
          return (
            <button
              key={isEveryone ? 'everyone' : user!.email}
              type="button"
              className={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-white/5 ${
                index === selectedIndex ? 'bg-white/10' : ''
              }`}
              onClick={() => selectSuggestion(suggestion)}
            >
              {isEveryone ? (
                <>
                  <div className="size-6 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center text-xs font-bold">
                    @
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-orange-400">everyone</div>
                    <div className="text-xs text-muted-foreground">Notify all users (admin only)</div>
                  </div>
                </>
              ) : (
                <>
                  <Avatar className="size-6">
                    <AvatarImage src={user!.image || undefined} alt={user!.name || user!.email} />
                    <AvatarFallback className="bg-[color:var(--primary)]/15 text-[color:var(--primary)] text-xs">
                      <CarFront className="size-3" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {user!.name || user!.email}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {user!.email}
                    </div>
                  </div>
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

