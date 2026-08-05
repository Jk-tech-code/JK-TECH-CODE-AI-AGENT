'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ImageIcon, Mic, Paperclip, Send, Square, X, UploadCloud,
} from 'lucide-react';
import { toast } from 'sonner';
import { fileKindMeta, formatSize } from './file-meta';
import { useVoiceInput } from './use-voice-input';
import type { AttachmentItem } from './types';
import { cn } from '@/lib/utils';

interface PromptInputProps {
  value: string;
  loading: boolean;
  /** True while attachments are uploading — disables Send without switching to Stop. */
  busy?: boolean;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  attachments: AttachmentItem[];
  onAddFiles: (files: File[]) => void;
  onRemoveAttachment: (id: string) => void;
}


function AttachmentChip({
  attachment, onRemove, disabled,
}: {
  attachment: AttachmentItem; onRemove: (id: string) => void; disabled: boolean;
}) {
  const { Icon, color } = fileKindMeta(attachment.name, attachment.type);

  return (
    <div
      className="attachment-chip group/chip max-w-[260px]"
      role="listitem"
      aria-label={`Attachment: ${attachment.name}`}
    >
      {attachment.kind === 'image' && attachment.previewUrl ? (
        <img
          src={attachment.previewUrl}
          alt=""
          className="h-9 w-9 shrink-0 rounded-md border border-[var(--border-color)] object-cover"
        />
      ) : (
        <Icon className={cn('h-5 w-5 shrink-0', color)} />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-xs font-medium">{attachment.name}</span>
          <span className="shrink-0 text-[10px] text-[var(--text-muted-50)]">
            {formatSize(attachment.size)}
          </span>
        </div>
        {attachment.status === 'uploading' && (
          <div className="attachment-chip__progress" role="progressbar" aria-label={`Uploading ${attachment.name}`} aria-valuenow={attachment.progress || 0} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${attachment.progress || 0}%` }} />
          </div>
        )}
        {attachment.status === 'error' && (
          <span className="block truncate text-[10px] text-red-500">{attachment.error || 'Upload failed'}</span>
        )}
      </div>

      <button
        type="button"
        onClick={() => onRemove(attachment.id)}
        disabled={disabled}
        className="attachment-chip__remove"
        aria-label={`Remove ${attachment.name}`}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function PromptInput({
  value, loading, busy = false, onChange, onSend, onStop,
  attachments, onAddFiles, onRemoveAttachment,
}: PromptInputProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  // Latest value so voice transcripts append to fresh input even though the
  // `onTranscript` callback is created once.
  const valueRef = useRef(value);
  useEffect(() => { valueRef.current = value; }, [value]);

  const voice = useVoiceInput({
    onTranscript: text => {
      const prev = valueRef.current;
      const separator = prev && !/\s$/.test(prev) ? ' ' : '';
      onChange(`${prev}${separator}${text}`);
      requestAnimationFrame(() => ref.current?.focus());
    },
  });

  // Surface recognizer failures (permission denied, no mic, no speech, …).
  useEffect(() => {
    if (voice.error) toast.error(voice.error);
  }, [voice.error]);

  // Autosize
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [value, attachments]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      // Don't keep recording into the composer after the message is sent.
      if (voice.listening) voice.stop();
      onSend();
    }
  }, [onSend, voice]);

  const addFiles = useCallback((files: File[]) => {
    if (loading || busy) return;
    const accepted: File[] = [];
    for (const file of files) {
      if (file.size > 50 * 1024 * 1024) {
        toast.error(`${file.name} is larger than 50MB.`);
        continue;
      }
      accepted.push(file);
    }
    if (accepted.length > 0) onAddFiles(accepted);
  }, [loading, busy, onAddFiles]);

  const handleFilePick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) addFiles(Array.from(files));
    e.target.value = '';
  }, [addFiles]);

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLElement>) => {
    const files = e.clipboardData?.files;
    if (files && files.length > 0) {
      e.preventDefault();
      addFiles(Array.from(files));
    }
  }, [addFiles]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (e.dataTransfer?.files?.length) addFiles(Array.from(e.dataTransfer.files));
  }, [addFiles]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleMic = useCallback(() => {
    if (!voice.supported) {
      toast.info("Voice input isn't supported in this browser. Try Chrome or Edge — or attach an audio file instead.");
      return;
    }
    if (voice.listening) voice.stop();
    else voice.start();
  }, [voice]);

  const canSend = (value.trim().length > 0 || attachments.length > 0) && !loading && !busy;

  return (
    <div className="mx-auto w-full max-w-3xl px-3 pb-3 sm:px-4 sm:pb-4">
      <motion.div
        initial={{ y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.3 }}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onPaste={handlePaste}
        className="relative rounded-2xl border border-[var(--border-color)] bg-[var(--surface)] shadow-soft transition-all focus-within:border-[var(--accent)]/60 focus-within:ring-4 focus-within:ring-[var(--accent)]/10"
      >
        {dragging && (
          <div className="composer-drag-overlay">
            <div className="flex flex-col items-center gap-2 text-[var(--accent)]">
              <UploadCloud className="h-8 w-8" />
              <span className="text-sm font-semibold">Drop files to attach them</span>
            </div>
          </div>
        )}

        {/* Attachments live inside the composer until Send */}
        {attachments.length > 0 && (
          <ul role="list" aria-label="Attachments" className="flex flex-wrap gap-2 px-3 pt-3">
            <AnimatePresence initial={false}>
              {attachments.map(att => (
                <motion.li
                  key={att.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                >
                  <AttachmentChip attachment={att} onRemove={onRemoveAttachment} disabled={loading} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}

        {/* Live voice input indicator — shows the interim transcript while speaking */}
        {voice.listening && (
          <div role="status" aria-live="polite" className="flex items-center gap-2 px-4 pt-3">
            <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-[var(--accent)]" />
            <span className="shrink-0 text-xs font-semibold text-[var(--accent)]">Listening…</span>
            {voice.interim && (
              <span className="min-w-0 flex-1 truncate text-xs italic text-[var(--text-muted-70)]">
                {voice.interim}
              </span>
            )}
            <button
              type="button"
              onClick={voice.stop}
              aria-label="Stop listening"
              title="Stop listening (Esc)"
              className="shrink-0 rounded-md p-1 text-[var(--text-muted-50)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
            >
              <Square className="h-3 w-3 fill-current" />
            </button>
          </div>
        )}

        <textarea
          ref={ref}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={attachments.length > 0 ? 'Ask about these files…' : 'Message JK-TECH-CODE AI — paste or drop images & files here…'}
          rows={1}
          aria-label="Your message"
          className="max-h-[220px] w-full resize-none bg-transparent px-4 pt-4 pb-1 text-sm leading-relaxed text-[var(--text-primary)] placeholder:text-[var(--text-muted-30)] outline-none"
        />

        <div className="flex items-center gap-1 px-2.5 pb-2.5">
          {/* Attach tools */}
          <div className="flex items-center gap-0.5">
            <input
              ref={fileRef} type="file" multiple className="hidden"
              accept=".pdf,.doc,.docx,.xlsx,.xls,.pptx,.ppt,.csv,.txt,.md,.json,.zip,.rar,.7z,.mp3,.wav,.mp4,.webm,.mov"
              onChange={handleFilePick} aria-hidden="true" tabIndex={-1}
            />
            <input
              ref={imageRef} type="file" multiple accept="image/*" className="hidden"
              onChange={handleFilePick} aria-hidden="true" tabIndex={-1}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={loading || busy}
              className="rounded-lg p-2 text-[var(--text-muted-50)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
              aria-label="Attach files"
              title="Attach files"
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => imageRef.current?.click()}
              disabled={loading || busy}
              className="rounded-lg p-2 text-[var(--text-muted-50)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
              aria-label="Upload images"
              title="Upload images"
            >
              <ImageIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleMic}
              disabled={loading || busy || !voice.supported}
              aria-pressed={voice.listening}
              className={cn(
                'rounded-lg p-2 transition-colors disabled:opacity-40',
                voice.listening
                  ? 'animate-pulse bg-[var(--accent)]/15 text-[var(--accent)]'
                  : 'text-[var(--text-muted-50)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]',
              )}
              aria-label={voice.listening ? 'Stop voice input' : 'Voice input'}
              title={voice.listening ? 'Stop voice input (Esc)' : voice.supported ? 'Voice input' : 'Voice input is not supported in this browser'}
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
                  title="Stop generating (Esc)"
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                </motion.button>
              ) : (
                <motion.button
                  key="send"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  onClick={() => {
                    // Stop recording before sending so the transcript doesn't
                    // land in the composer after it has been cleared.
                    if (voice.listening) voice.stop();
                    onSend();
                  }}
                  disabled={!canSend}
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)] text-white transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:hover:bg-[var(--accent)]"
                  aria-label="Send message"
                  title="Send message (Enter)"
                >
                  <Send className="h-4 w-4" />
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>

      <p className="mt-2 text-center text-[10px] text-[var(--text-muted-30)]">
        Files are attached below until you press Send &middot; Enter to send &middot; Shift+Enter for a new line
        {attachments.length > 0 && (
          <span className="text-[var(--accent)]"> &middot; {attachments.length} attachment{attachments.length > 1 ? 's' : ''}</span>
        )}
      </p>
    </div>
  );
}
