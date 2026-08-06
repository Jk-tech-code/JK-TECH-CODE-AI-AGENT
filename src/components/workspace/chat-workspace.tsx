'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLatest } from '@reactuses/core';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDown, PanelLeft, Search } from 'lucide-react';
import { toast } from 'sonner';
import { TopNav } from './top-nav';
import { Sidebar, type SidebarConversation } from './sidebar';
import { MessageBubble } from './message-bubble';
import { PromptInput } from './prompt-input';
import { EmptyState } from './empty-state';
import { readStream, StreamError } from '@/lib/chat/stream-client';
import { detectKind, fileExtension } from './file-meta';
import type { AttachmentItem, WorkspaceMessage } from './types';
import { Button } from '@/components/ui/button';

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function formatRelative(ts: number) {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function titleFromInput(input: string): string {
  const words = input.trim().split(/\s+/);
  return words.slice(0, 6).join(' ') || 'New chat';
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'conversation';
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const STORAGE_KEY = 'jktc-chat-history';

interface PersistedChat {
  id: string;
  title: string;
  createdAt: number;
  messages: WorkspaceMessage[];
  pinned?: boolean;
  favorite?: boolean;
}

function loadHistory(): PersistedChat[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistHistory(chats: PersistedChat[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats.slice(0, 30)));
  } catch {
    /* storage full or unavailable */
  }
}

/**
 * Uploads a single file to the existing /api/upload endpoint with progress.
 */
function uploadFileWithProgress(
  file: File,
  onProgress: (pct: number) => void,
): Promise<{ id: string; fileType: string; title: string }> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload');
    xhr.upload.onprogress = e => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let data: { id?: string; error?: string; fileType?: string; title?: string } = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* ignore */ }
      if (xhr.status >= 200 && xhr.status < 300 && data.id) {
        resolve({ id: data.id, fileType: data.fileType || '', title: data.title || file.name });
      } else {
        reject(Object.assign(new Error(data.error || 'Upload failed.'), { status: xhr.status }));
      }
    };
    xhr.onerror = () => reject(new Error('Network error during upload.'));
    xhr.send(form);
  });
}

export function ChatWorkspace() {
  const [messages, setMessages] = useState<WorkspaceMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [nearBottom, setNearBottom] = useState(true);
  const [searchSignal, setSearchSignal] = useState(0);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // History + conversations
  const [history, setHistory] = useState<PersistedChat[]>(loadHistory);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Batches stream deltas into one state update per animation frame so long
  // responses don't trigger a React re-render per token.
  const pendingDeltaRef = useRef('');
  const flushFrameRef = useRef<number | null>(null);

  // Live refs so stable callbacks always read current state
  const state = useLatest({ input, messages, activeChatId, attachments, loading });

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  // Auto-scroll to newest
  useEffect(() => {
    if (nearBottom) scrollToBottom('smooth');
  }, [messages, loading, nearBottom, scrollToBottom]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    setNearBottom(distance < 90);
  }, []);

  // Persist history whenever it changes
  useEffect(() => {
    persistHistory(history);
  }, [history]);

  const conversations: SidebarConversation[] = history.map(c => {
    const last = c.messages[c.messages.length - 1];
    return {
      id: c.id,
      title: c.title,
      preview: last ? (last.role === 'user' ? `You: ${last.content.slice(0, 60)}` : last.content.slice(0, 60)) : '',
      time: formatRelative(c.createdAt),
      pinned: c.pinned,
      favorite: c.favorite,
      unread: c.id === activeChatId ? false : undefined,
      // Full message text so the sidebar search can match conversation content.
      content: c.messages.map(m => m.content).join('\n'),
    };
  });

  /* ─── stable handlers ─── */

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success('Copied to clipboard!'),
      () => toast.error('Failed to copy.'),
    );
  }, []);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setLoading(false);
  }, []);

  /** Persists the current thread into localStorage history. */
  const persistChat = useCallback((chatMessages: WorkspaceMessage[], title: string) => {
    const resolvedId = state.current.activeChatId || generateId();
    setHistory(prev => {
      const existing = prev.find(c => c.id === resolvedId);
      const entry: PersistedChat = {
        id: resolvedId,
        title: existing?.title || title,
        createdAt: existing?.createdAt || Date.now(),
        messages: chatMessages,
        pinned: existing?.pinned,
        favorite: existing?.favorite,
      };
      return existing
        ? prev.map(c => (c.id === resolvedId ? entry : c))
        : [entry, ...prev];
    });
    if (!state.current.activeChatId) setActiveChatId(resolvedId);
  }, []);

  /* ─── send / stream ─── */

  const sendMessage = useCallback(async (rawInput?: string, opts?: {
    attachments?: AttachmentItem[];
    /** When regenerating/retrying, the thread has already been truncated in the
     * UI but state.current hasn't re-rendered yet — pass the exact list so the
     * request context doesn't include the stale reply being replaced. */
    messagesOverride?: WorkspaceMessage[];
  }) => {
    if (state.current.loading) return;

    const trimmed = (rawInput ?? state.current.input).trim();
    const sendAttachments = opts?.attachments ?? state.current.attachments;
    const baseMessages = opts?.messagesOverride ?? state.current.messages;
    if (!trimmed && sendAttachments.length === 0) return;

    // 1) Upload attachments — only after Send is clicked; files never leave the composer before.
    let uploaded: AttachmentItem[] = [];
    let finalText = trimmed;
    if (sendAttachments.length > 0) {
      setUploading(true);
      setAttachments(prev => prev.map(a => ({ ...a, status: 'uploading' as const, progress: 0 })));

      const pending: AttachmentItem[] = [];
      for (const att of sendAttachments) {
        try {
          const res = await uploadFileWithProgress(att.file!, pct => {
            setAttachments(prev => prev.map(a => (a.id === att.id ? { ...a, progress: pct } : a)));
          });
          pending.push({ ...att, status: 'done', docId: res.id });
        } catch (err: unknown) {
          const status = (err as { status?: number })?.status;
          if (status === 401 || status === 403 || status === 400) {
            // 401/403: anonymous/local-storage mode. 400: an unsupported file type
            // (zip, audio, video, …) that can never be uploaded. In both cases we
            // degrade gracefully — never block the conversation — by naming the
            // file as a reference so the AI still knows it was attached.
            finalText = `${finalText}\n\n[Attached file: ${att.name}]`;
            toast.info(`${att.name} couldn't be uploaded — sent as a reference instead.`);
          } else {
            const message = err instanceof Error ? err.message : 'Upload failed.';
            // Mark the failed chip as errored and reset the rest back to 'ready'
            // so they're not stuck showing an endless progress bar.
            setAttachments(prev => prev.map(a => a.id === att.id
              ? { ...a, status: 'error', error: message }
              : a.status === 'uploading' ? { ...a, status: 'ready' } : a,
            ));
            setUploading(false);
            toast.error(message);
            return; // don't send until the failed attachment is removed
          }
        }
      }
      uploaded = pending;
      setUploading(false);
      setAttachments([]);
    }

    const userMsg: WorkspaceMessage = {
      id: generateId(),
      role: 'user',
      content: finalText,
      timestamp: Date.now(),
      // Persist only serializable fields — never the raw File / object URLs.
      attachments: uploaded.length > 0
        ? uploaded.map(a => ({ id: a.id, name: a.name, size: a.size, type: a.type, kind: a.kind, status: a.status, docId: a.docId }))
        : undefined,
    };
    const assistantId = generateId();
    const assistantMsg: WorkspaceMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      streaming: true,
    };

    const contextMsgs = [...baseMessages, userMsg].map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    setInput('');
    setLoading(true);
    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setNearBottom(true);
    setTimeout(() => scrollToBottom('smooth'), 30);

    const abortController = new AbortController();
    abortRef.current = abortController;

    let streamedContent = '';

    // Flushes any deltas still queued for the next animation frame. Hoisted out
    // of the try block so both the success path and the catch handler can use it.
    const flushPending = () => {
      if (flushFrameRef.current != null) {
        cancelAnimationFrame(flushFrameRef.current);
        flushFrameRef.current = null;
      }
      if (pendingDeltaRef.current) {
        const chunk = pendingDeltaRef.current;
        pendingDeltaRef.current = '';
        setMessages(prev => prev.map(m =>
          m.id === assistantId ? { ...m, content: m.content + chunk } : m,
        ));
      }
    };

    try {
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: contextMsgs,
          attachments: uploaded
            .filter(a => a.docId)
            .map(a => ({ id: a.docId!, fileType: fileExtension(a.name) || a.type, title: a.name })),
        }),
        signal: abortController.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Request failed.');
      }

      const result = await readStream(res, {
        onStatus: status => {
          setMessages(prev => prev.map(m =>
            m.id === assistantId ? { ...m, streamingStatus: status } : m,
          ));
        },
        onContent: delta => {
          streamedContent += delta;
          // Batch deltas into a single render per animation frame instead of
          // one re-render per token.
          pendingDeltaRef.current += delta;
          if (flushFrameRef.current == null) {
            flushFrameRef.current = requestAnimationFrame(() => {
              flushFrameRef.current = null;
              const chunk = pendingDeltaRef.current;
              pendingDeltaRef.current = '';
              if (!chunk) return;
              setMessages(prev => prev.map(m =>
                m.id === assistantId ? { ...m, content: m.content + chunk } : m,
              ));
            });
          }
        },
      });

      // Flush any deltas still queued for the next frame.
      flushPending();

      // Success — finalize with the exact streamed content.
      const finalMessages = state.current.messages.map(m =>
        m.id === assistantId
          ? { ...m, content: result.content, streaming: false, timestamp: Date.now() }
          : m,
      );
      setMessages(finalMessages);
      persistChat(finalMessages, titleFromInput(trimmed));
    } catch (err: unknown) {
      flushPending();
      if (err instanceof DOMException && err.name === 'AbortError') {
        // User pressed Stop — keep whatever streamed so far, never a blank bubble,
        // and persist the partial response so it survives a refresh.
        const stopped = state.current.messages
          .filter(m => m.id !== assistantId || streamedContent)
          .map(m => m.id === assistantId
            ? { ...m, content: streamedContent, streaming: false }
            : m);
        setMessages(stopped);
        if (streamedContent) {
          persistChat(stopped, titleFromInput(trimmed));
          toast.info('Stream stopped — partial response saved.');
        } else {
          toast.info('Stream stopped.');
        }
      } else {
        const message = err instanceof StreamError ? err.message
          : err instanceof Error ? err.message
            : 'Something went wrong. Please try again.';
        console.error('[workspace] chat stream failed:', err);

        // If partial content streamed, keep it as a completed message (and persist it).
        // Otherwise replace the bubble with a friendly error card + Retry.
        const hasContent = streamedContent.length > 0;
        if (hasContent) {
          const finalMessages = state.current.messages.map(m =>
            m.id === assistantId ? { ...m, streaming: false } : m,
          );
          setMessages(finalMessages);
          persistChat(finalMessages, titleFromInput(trimmed));
        } else {
          const finalMessages = state.current.messages.map(m =>
            m.id === assistantId
              ? { ...m, streaming: false, error: true, errorText: message }
              : m,
          );
          setMessages(finalMessages);
          persistChat(finalMessages, titleFromInput(trimmed));
        }
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [persistChat, scrollToBottom]);

  /** Truncates the thread back to the user message before `message` and resends it (Retry / Regenerate). */
  const resendFromUser = useCallback((message: WorkspaceMessage) => {
    const current = state.current.messages;
    const idx = current.findIndex(m => m.id === message.id);
    const precedingUser = [...current.slice(0, idx)].reverse().find(m => m.role === 'user');
    if (!precedingUser) return;

    const cutIdx = current.findIndex(m => m.id === precedingUser.id);
    const truncated = current.slice(0, Math.max(0, cutIdx));
    setMessages(truncated);
    setHistory(prev => prev.map(c =>
      c.id === state.current.activeChatId ? { ...c, messages: truncated } : c,
    ));
    void sendMessage(precedingUser.content, { messagesOverride: truncated });
  }, [sendMessage]);

  /** Asks the assistant to continue the last response. */
  const handleContinue = useCallback(() => {
    const current = state.current.messages;
    const lastAssistant = [...current].reverse().find(m => m.role === 'assistant' && m.content);
    if (!lastAssistant) return;
    void sendMessage('Please continue your response from where you left off. Do not repeat what you already wrote.');
  }, [sendMessage]);

  const handleEdit = useCallback((message: WorkspaceMessage) => {
    setInput(message.content);
    setMessages(prev => prev.filter(m => m.id !== message.id));
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, []);

  const handleDeleteMessage = useCallback((id: string) => {
    setMessages(prev => prev.filter(m => m.id !== id));
    setHistory(prev => prev.map(c => c.id === state.current.activeChatId
      ? { ...c, messages: c.messages.filter(m => m.id !== id) }
      : c));
  }, []);

  const handleShare = useCallback((message: WorkspaceMessage) => {
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      navigator.share({ text: message.content }).catch(() => {
        handleCopy(message.content);
      });
    } else {
      handleCopy(message.content);
      toast.success('Response copied — ready to share!');
    }
  }, [handleCopy]);

  const handleDownload = useCallback((message: WorkspaceMessage) => {
    const blob = new Blob([message.content], { type: 'text/markdown;charset=utf-8' });
    downloadBlob(blob, `response-${slugify(message.content.slice(0, 30)) || 'download'}.md`);
    toast.success('Response downloaded.');
  }, []);

  const handleReact = useCallback((id: string, reaction: 'up' | 'down' | null) => {
    setMessages(prev => prev.map(m => (m.id === id ? { ...m, reaction } : m)));
    setHistory(prev => prev.map(c => c.id === state.current.activeChatId
      ? { ...c, messages: c.messages.map(m => (m.id === id ? { ...m, reaction } : m)) }
      : c));
  }, []);

  /* ─── attachments ─── */

  const handleAddFiles = useCallback((files: File[]) => {
    setAttachments(prev => {
      const next = [...prev];
      for (const file of files) {
        const exists = next.some(a => a.name === file.name && a.size === file.size);
        if (exists) continue;
        next.push({
          id: generateId(),
          name: file.name,
          size: file.size,
          type: file.type,
          kind: detectKind(file.name, file.type),
          file,
          previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
          status: 'ready',
        });
      }
      return next;
    });
    if (files.length > 0) {
      toast.success(`${files.length} file${files.length > 1 ? 's' : ''} attached — they'll upload when you Send.`);
    }
  }, []);

  const handleRemoveAttachment = useCallback((id: string) => {
    setAttachments(prev => {
      const target = prev.find(a => a.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter(a => a.id !== id);
    });
  }, []);

  /* ─── conversation management ─── */

  const handleNewChat = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setInput('');
    setLoading(false);
    setActiveChatId(null);
    setMobileSidebarOpen(false);
    setAttachments(prev => {
      prev.forEach(a => a.previewUrl && URL.revokeObjectURL(a.previewUrl));
      return [];
    });
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, []);

  const openConversation = useCallback((id: string) => {
    const chat = history.find(c => c.id === id);
    if (chat) {
      abortRef.current?.abort();
      setMessages(chat.messages.map(m => ({ ...m, streaming: false })));
      setActiveChatId(id);
      setLoading(false);
      setNearBottom(true);
      setMobileSidebarOpen(false);
    }
  }, [history]);

  const deleteConversation = useCallback((id: string) => {
    setHistory(prev => prev.filter(c => c.id !== id));
    if (activeChatId === id) handleNewChat();
    toast.success('Conversation deleted.');
  }, [activeChatId, handleNewChat]);

  const togglePin = useCallback((id: string) => {
    setHistory(prev => prev.map(c => (c.id === id ? { ...c, pinned: !c.pinned } : c)));
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    setHistory(prev => prev.map(c => (c.id === id ? { ...c, favorite: !c.favorite } : c)));
  }, []);

  const handleRename = useCallback((id: string, title: string) => {
    setHistory(prev => prev.map(c => (c.id === id ? { ...c, title: title.trim() || c.title } : c)));
  }, []);

  const handleExport = useCallback((id: string) => {
    const chat = history.find(c => c.id === id);
    if (!chat || chat.messages.length === 0) {
      toast.info('Nothing to export yet.');
      return;
    }
    const lines = chat.messages.map(m =>
      `**${m.role === 'user' ? 'You' : 'JK-TECH-CODE AI'}** · ${new Date(m.timestamp).toLocaleString()}\n\n${m.content}`,
    ).join('\n\n---\n\n');
    const blob = new Blob([`# ${chat.title}\n\n${lines}\n`], { type: 'text/markdown;charset=utf-8' });
    downloadBlob(blob, `${slugify(chat.title)}.md`);
    toast.success('Conversation exported as Markdown.');
  }, [history]);

  const handleSuggestion = useCallback((prompt: string) => {
    setInput(prompt);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, []);

  const handleOpenSearch = useCallback(() => {
    setSearchSignal(s => s + 1);
  }, []);

  /* ─── keyboard shortcuts ─── */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchSignal(s => s + 1);
        return;
      }
      if (mod && e.key === 'Enter') {
        e.preventDefault();
        if (!state.current.loading) void sendMessage();
        return;
      }
      if (e.key === 'Escape' && state.current.loading) {
        handleStop();
        return;
      }
      if (e.key === '/' && !state.current.loading) {
        const tag = (document.activeElement?.tagName || '').toLowerCase();
        if (tag !== 'input' && tag !== 'textarea' && tag !== 'button') {
          e.preventDefault();
          textareaRef.current?.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleStop, sendMessage]);

  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-dvh flex-col bg-[var(--background)]">
      <TopNav
        onToggleSidebar={() => setSidebarCollapsed(v => !v)}
        onOpenSearch={handleOpenSearch}
      />

      <div className="flex min-h-0 flex-1">
        <Sidebar
          conversations={conversations}
          activeId={activeChatId}
          collapsed={sidebarCollapsed}
          searchFocusSignal={searchSignal}
          mobileOpen={mobileSidebarOpen}
          onMobileClose={() => setMobileSidebarOpen(false)}
          onToggleCollapse={() => setSidebarCollapsed(v => !v)}
          onNewChat={handleNewChat}
          onSelect={openConversation}
          onDelete={deleteConversation}
          onTogglePin={togglePin}
          onToggleFavorite={toggleFavorite}
          onRename={handleRename}
          onExport={handleExport}
        />

        {/* Main chat column */}
        <main id="main-content" className="flex min-w-0 flex-1 flex-col">
          {/* Mobile sidebar toggle — opens the slide-over drawer */}
          <div className="flex h-9 items-center gap-2 px-3 md:hidden">
            <Button
              variant="ghost" size="icon"
              onClick={() => setMobileSidebarOpen(true)}
              className="h-8 w-8 text-[var(--text-muted-50)]"
              aria-label="Open chat list"
            >
              <PanelLeft className="h-4 w-4" />
            </Button>
            <button
              type="button"
              onClick={() => { setMobileSidebarOpen(true); setSearchSignal(s => s + 1); }}
              className="flex flex-1 items-center gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--text-muted-30)]"
            >
              <Search className="h-3.5 w-3.5" />
              Search chats...
            </button>
          </div>

          {/* Scrollable messages */}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="relative min-h-0 flex-1 overflow-y-auto px-4 sm:px-6"
            role="log"
            aria-label="Chat messages"
            aria-live="polite"
          >
            <div className="mx-auto w-full max-w-[900px] py-4">
              {isEmpty ? (
                <EmptyState onPrompt={handleSuggestion} />
              ) : (
                <>
                  <AnimatePresence initial={false}>
                    {messages.map(msg => (
                      <MessageBubble
                        key={msg.id}
                        message={msg}
                        onCopy={handleCopy}
                        onRetry={resendFromUser}
                        onRegenerate={resendFromUser}
                        onEdit={handleEdit}
                        onShare={handleShare}
                        onDownload={handleDownload}
                        onDelete={handleDeleteMessage}
                        onReact={handleReact}
                      />
                    ))}
                  </AnimatePresence>

                  {/* Loading indicator (extra reply is in-flight) */}
                  {loading && !messages.some(m => m.streaming) && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center gap-2 pl-1 py-2"
                    >
                      <span className="typing-dots" role="status" aria-label="Assistant is typing">
                        <span /><span /><span />
                      </span>
                    </motion.div>
                  )}

                  {/* Continue generating — only after a completed assistant response */}
                  {!loading && messages.length > 0
                    && messages[messages.length - 1]?.role === 'assistant'
                    && !messages[messages.length - 1]?.streaming
                    && !messages[messages.length - 1]?.error
                    && (
                    <div className="pl-1 pb-1">
                      <button
                        type="button"
                        onClick={handleContinue}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--text-muted-70)] transition-colors hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
                      >
                        <ArrowDown className="h-3 w-3" />
                        Continue generating
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Scroll-to-bottom */}
            {!nearBottom && messages.length > 0 && (
              <button
                type="button"
                className="scroll-bottom-btn"
                onClick={() => { setNearBottom(true); scrollToBottom('smooth'); }}
                aria-label="Scroll to bottom"
                title="Scroll to bottom"
              >
                <ArrowDown className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Prompt */}
          <PromptInput
            value={input}
            loading={loading}
            busy={uploading}
            onChange={setInput}
            onSend={() => void sendMessage()}
            onStop={handleStop}
            attachments={attachments}
            onAddFiles={handleAddFiles}
            onRemoveAttachment={handleRemoveAttachment}
          />
        </main>
      </div>
    </div>
  );
}
