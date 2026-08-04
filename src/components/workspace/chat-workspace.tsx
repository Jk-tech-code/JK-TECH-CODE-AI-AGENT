'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { PanelLeft, Search } from 'lucide-react';
import { toast } from 'sonner';
import { TopNav } from './top-nav';
import { Sidebar, type SidebarConversation } from './sidebar';
import { MessageBubble, type WorkspaceMessage } from './message-bubble';
import { PromptInput } from './prompt-input';
import { EmptyState } from './empty-state';
import { Button } from '@/components/ui/button';

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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

export function ChatWorkspace() {
  const [messages, setMessages] = useState<WorkspaceMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [modelName, setModelName] = useState('JK-TECH-CODE Assistant');
  const [attachments, setAttachments] = useState<string[]>([]);

  // History + conversations
  const [history, setHistory] = useState<PersistedChat[]>(loadHistory);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to newest
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, loading]);

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
    };
  });

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success('Copied to clipboard!'),
      () => toast.error('Failed to copy.'),
    );
  }, []);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setLoading(false);
    setStreamingId(null);
  }, []);

  const sendMessage = useCallback(async (rawInput?: string) => {
    const trimmed = (rawInput ?? input).trim();
    if (!trimmed || loading) return;

    const userMsg: WorkspaceMessage = {
      id: generateId(),
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
    };
    const assistantId = generateId();
    const assistantMsg: WorkspaceMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      streaming: true,
    };

    const contextMsgs = [...messages, userMsg].map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    setInput('');
    setLoading(true);
    setStreamingId(assistantId);
    setMessages(prev => [...prev, userMsg, assistantMsg]);

    const abortController = new AbortController();
    abortRef.current = abortController;

    try {
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: contextMsgs }),
        signal: abortController.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Request failed.');
        setMessages(prev => prev.filter(m => m.id !== assistantId));
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No stream reader');

      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(l => l.startsWith('data: '));
        for (const line of lines) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.done) break;
            if (data.content) {
              fullContent += data.content;
              setMessages(prev => prev.map(m =>
                m.id === assistantId ? { ...m, content: fullContent } : m,
              ));
            }
          } catch (e) {
            console.warn('[workspace] failed to parse SSE chunk:', e);
          }
        }
      }

      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { ...m, content: fullContent, timestamp: Date.now(), streaming: false } : m,
      ));

      // Save/update conversation in history
      const title = titleFromInput(trimmed);
      const resolvedId = activeChatId || generateId();
      setHistory(prev => {
        const existing = prev.find(c => c.id === resolvedId);
        const currentMessages = existing
          ? [...existing.messages, userMsg, { ...assistantMsg, content: fullContent, streaming: false }]
          : [userMsg, { ...assistantMsg, content: fullContent, streaming: false }];
        const entry: PersistedChat = {
          id: resolvedId,
          title: existing?.title || title,
          createdAt: existing?.createdAt || Date.now(),
          messages: currentMessages,
          pinned: existing?.pinned,
          favorite: existing?.favorite,
        };
        return existing
          ? prev.map(c => c.id === resolvedId ? entry : c)
          : [entry, ...prev];
      });
      if (!activeChatId) setActiveChatId(resolvedId);
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        toast.info('Stream stopped.');
      } else {
        toast.error('Network error.');
        setMessages(prev => prev.filter(m => m.id !== assistantId));
      }
    } finally {
      setLoading(false);
      setStreamingId(null);
      abortRef.current = null;
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [input, loading, messages, activeChatId]);

  const handleNewChat = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setInput('');
    setLoading(false);
    setStreamingId(null);
    setActiveChatId(null);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, []);

  const openConversation = useCallback((id: string) => {
    const chat = history.find(c => c.id === id);
    if (chat) {
      abortRef.current?.abort();
      setMessages(chat.messages.map(m => ({ ...m, streaming: false })));
      setActiveChatId(id);
      setLoading(false);
      setStreamingId(null);
    }
  }, [history]);

  const deleteConversation = useCallback((id: string) => {
    setHistory(prev => prev.filter(c => c.id !== id));
    if (activeChatId === id) handleNewChat();
    toast.success('Conversation deleted.');
  }, [activeChatId, handleNewChat]);

  const togglePin = useCallback((id: string) => {
    setHistory(prev => prev.map(c => c.id === id ? { ...c, pinned: !c.pinned } : c));
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    setHistory(prev => prev.map(c => c.id === id ? { ...c, favorite: !c.favorite } : c));
  }, []);

  const handleSuggestion = useCallback((prompt: string) => {
    setInput(prompt);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, []);

  const handleRetry = useCallback((message: WorkspaceMessage) => {
    const idx = messages.findIndex(m => m.id === message.id);
    const precedingUser = [...messages.slice(0, idx)].reverse().find(m => m.role === 'user');
    if (precedingUser) {
      // Truncate the thread back to before that user message, then resend it.
      const cutIdx = messages.findIndex(m => m.id === precedingUser.id);
      setMessages(prev => prev.slice(0, Math.max(0, cutIdx)));
      sendMessage(precedingUser.content);
    }
  }, [messages, sendMessage]);

  const handleEdit = useCallback((message: WorkspaceMessage) => {
    setInput(message.content);
    setMessages(prev => prev.filter(m => m.id !== message.id));
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, []);

  const handleDeleteMessage = useCallback((id: string) => {
    setMessages(prev => prev.filter(m => m.id !== id));
    setHistory(prev => prev.map(c => c.id === activeChatId
      ? { ...c, messages: c.messages.filter(m => m.id !== id) }
      : c));
  }, [activeChatId]);

  const handleShare = useCallback((message: WorkspaceMessage) => {
    navigator.clipboard.writeText(message.content).then(
      () => toast.success('Response copied — ready to share!'),
      () => toast.error('Failed to copy.'),
    );
  }, []);

  const handleAttach = useCallback((file: File) => {
    setAttachments(prev => [...prev, file.name]);
  }, []);

  const handleImage = useCallback((file: File) => {
    setAttachments(prev => [...prev, file.name]);
  }, []);

  const handleOpenSearch = useCallback(() => {
    toast.info('Searching your chat history...');
  }, []);

  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-dvh flex-col bg-[var(--background)]">
      <TopNav
        onToggleSidebar={() => setSidebarCollapsed(v => !v)}
        onOpenSearch={handleOpenSearch}
        modelName={modelName}
        onModelChange={setModelName}
      />

      <div className="flex min-h-0 flex-1">
        <Sidebar
          conversations={conversations}
          activeId={activeChatId}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(v => !v)}
          onNewChat={handleNewChat}
          onSelect={openConversation}
          onDelete={deleteConversation}
          onTogglePin={togglePin}
          onToggleFavorite={toggleFavorite}
        />

        {/* Main chat column */}
        <main className="flex min-w-0 flex-1 flex-col">
          {/* Mobile sidebar toggle */}
          <div className="flex h-9 items-center gap-2 px-3 md:hidden">
            <Button
              variant="ghost" size="icon"
              onClick={() => setSidebarCollapsed(v => !v)}
              className="h-8 w-8 text-[var(--text-muted-50)]"
              aria-label="Toggle sidebar"
            >
              <PanelLeft className="h-4 w-4" />
            </Button>
            <button
              type="button"
              onClick={handleOpenSearch}
              className="flex flex-1 items-center gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--text-muted-30)]"
            >
              <Search className="h-3.5 w-3.5" />
              Search chats...
            </button>
          </div>

          {/* Scrollable messages */}
          <div
            ref={scrollRef}
            className="min-h-0 flex-1 overflow-y-auto px-4 sm:px-6"
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
                        onRetry={msg.role === 'assistant' ? handleRetry : undefined}
                        onEdit={msg.role === 'user' ? handleEdit : undefined}
                        onShare={handleShare}
                        onDelete={handleDeleteMessage}
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
                      <span className="typing-dots" aria-label="Assistant is typing">
                        <span /><span /><span />
                      </span>
                    </motion.div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Attachments strip */}
          <AnimatePresence>
            {attachments.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mx-auto w-full max-w-3xl px-4"
              >
                <div className="flex flex-wrap gap-2 pb-2">
                  {attachments.map(name => (
                    <span key={name} className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-2.5 py-1 text-xs text-[var(--text-muted-70)]">
                      📎 {name}
                      <button
                        type="button"
                        onClick={() => setAttachments(prev => prev.filter(n => n !== name))}
                        className="ml-1 text-[var(--text-muted-30)] hover:text-red-400"
                        aria-label={`Remove ${name}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Prompt */}
          <PromptInput
            value={input}
            loading={loading}
            onChange={setInput}
            onSend={() => sendMessage()}
            onStop={handleStop}
            onAttach={handleAttach}
            onImage={handleImage}
          />
        </main>
      </div>
    </div>
  );
}