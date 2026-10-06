"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { EMOJI_KEYWORDS } from "@/domain/emoji";

/** The keyword map's icons plus a few more common routine ones, without repeats. */
const CHOICES = [
  ...new Set([
    ...EMOJI_KEYWORDS.map(([, emoji]) => emoji),
    "📋",
    "☀️",
    "🌙",
    "🎯",
    "💬",
    "🧠",
    "❤️",
    "🎒",
    "🔌",
    "🚰",
    "🍞",
    "🦶",
    "🧴",
    "🎵",
    "🙏",
    "✅",
  ]),
];

/**
 * Icon picker for a task: a grid of suggestions plus "type any emoji" (the system keyboard's
 * emoji panel works in the field).
 */
export function EmojiPicker({
  current,
  onPick,
  onClose,
}: {
  current: string;
  onPick: (emoji: string) => void;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  const inputId = useId();
  return (
    <Sheet title="Pick an icon" onClose={onClose} testId="emoji-picker">
      <div role="group" aria-label="Icons" className="grid grid-cols-7 gap-1.5">
        {CHOICES.map((emoji) => (
          <button
            key={emoji}
            type="button"
            aria-pressed={emoji === current}
            aria-label={`Use ${emoji}`}
            onClick={() => onPick(emoji)}
            className={`flex aspect-square min-h-11 items-center justify-center rounded-xl text-[22px] ${emoji === current ? "bg-tint ring-2 ring-primary" : "bg-screen"}`}
          >
            {emoji}
          </button>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (typed.trim()) onPick(typed.trim());
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          Or type any emoji
        </label>
        <input
          id={inputId}
          value={typed}
          maxLength={16}
          placeholder="Or type any emoji"
          onChange={(event) => setTyped(event.target.value)}
          className="min-h-11 flex-1 rounded-chip border border-border bg-surface px-3.5 text-[15px] outline-none focus:border-primary"
        />
        <Button type="submit" disabled={!typed.trim()}>
          Use it
        </Button>
      </form>
    </Sheet>
  );
}
