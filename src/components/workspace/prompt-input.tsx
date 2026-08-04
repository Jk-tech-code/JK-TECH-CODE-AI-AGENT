'use client';

import { useCallback, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ImageIcon, Mic, Paperclip, Send, Square } from 'lucide-react';
import { toast } from 'sonner';

interface PromptInputProps {
  value: string;
  loading: boolean;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  onAttach: (file: File) => void;
  onImage: (file: File) => void;
}

export function PromptInput({
  value, loading, onChange, onSend, onStop, onAttach, onImage,
}: PromptInputProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);

  // Autosize
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  // Focus after send
  useEffect(() => {
    if (!loading) ref.current?.focus();
  }, [loading]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  }, [onSend]);

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onAttach(file);
      toast.success(`Attached: ${file.name}`);
    }
    e.target.value = '';
  }, [onAttach]);

  const handleImage = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImage(file);
      toast.success(`Image selected: ${file.name}`);
    }
    e.target.value = '';
  }, [onImage]);

  const handleMic = useCallback(() => {
    toast.info('Voice input coming soon.');
  }, []);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-4">
      <motion.div
        initial={{ y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="rounded-2xl border border-[var(--border-color)] bg-[var(--surface)] shadow-soft transition-all focus-within:border-[var(--accent)]/60 focus-within:ring-4 focus-within:ring-[var(--accent)]/10"
      >
        <textarea
          ref={ref}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message JK-TECH-CODE AI..."
          rows={1}
          aria-label="Your message"
          className="max-h-[200px] w-full resize-none bg-transparent px-4 pt-4 pb-1 text-sm leading-relaxed text-[var(--text-primary)] placeholder:text-[var(--text-muted-30)] outline-none"
        />

        <div className="flex items-center gap-1 px-2.5 pb-2.5">
          {/* Attach tools */}
          <div className="flex items-center gap-0.5">
            <input ref={fileRef} type="file" className="hidden" onChange={handleFile} aria-hidden="true" tabIndex={-1} />
            <input ref={imageRef} type="file" accept="image/*" className="hidden" onChange={handleImage} aria-hidden="true" tabIndex={-1} />
            <button
              type="button" onClick={() => fileRef.current?.click()}
              className="rounded-lg p-2 text-[var(--text-muted-50)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
              aria-label="Attach file"
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <button
              type="button" onClick={() => imageRef.current?.click()}
              className="rounded-lg p-2 text-[var(--text-muted-50)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
              aria-label="Upload image"
            >
              <ImageIcon className="h-4 w-4" />
            </button>
            <button
              type="button" onClick={handleMic}
              className="rounded-lg p-2 text-[var(--text-muted-50)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
              aria-label="Voice input"
            >
              <Mic className="h-4 w-4" />
            </button>
          </div>

          {/* Send / stop */}
          <div className="ml-auto">
            <AnimatePresence mode="wait">
              {loading ? (
                <motion.button
                  key="stop"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  onClick={onStop}
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-500 text-white transition-colors hover:bg-red-600"
                  aria-label="Stop generating"
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                </motion.button>
              ) : (
                <motion.button
                  key="send"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  onClick={onSend}
                  disabled={!value.trim()}
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)] text-white transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:hover:bg-[var(--accent)]"
                  aria-label="Send message"
                >
                  <Send className="h-4 w-4" />
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>

      <p className="mt-2 text-center text-[10px] text-[var(--text-muted-30)]">
        JK-TECH-CODE AI can make mistakes. Press Enter to send &middot; Shift+Enter for a new line.
      </p>
    </div>
  );
}