'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertCircle, Send, Plus, Copy, Check, Bot, User, Loader2, Trash2, RefreshCw, Sparkles, Globe, StopCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { readStream, StreamError } from '@/lib/chat/stream-client';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  error?: boolean;
  errorText?: string;
}

const SUGGESTIONS = [
  'Explain how quantum computing works in simple terms',
  'What are the best programming languages to learn in 2026?',
  'Write a professional email declining a meeting',
  'Compare React vs Vue vs Svelte for a new project',
  'Help me brainstorm content ideas for a tech blog',
];

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function CodeBlock({ children, className }: { children?: React.ReactNode; className?: string }) {
  const [copied, setCopied] = useState(false);
  const code = String(children || '').replace(/\n$/, '');
  const lang = (className || '').replace(/^language-/, '') || 'code';

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 2000); },
      () => toast.error('Failed to copy.'),
    );
  }, [code]);

  return (
    <div className="code-block">
      <div className="code-block__header">
        <span className="code-block__lang">{lang}</span>
        <button type="button" className="code-block__copy" onClick={handleCopy} aria-label={`Copy ${lang} code`}>
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre>
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}

function MessageBubble({
  message, onCopy, onRetry, isStreaming,
}: {
  message: Message; onCopy: (text: string) => void; onRetry?: (message: Message) => void; isStreaming?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  const handleCopy = useCallback(() => {
    onCopy(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [message.content, onCopy]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'} mb-6`}
    >
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-1 shadow-soft ${
        isUser ? 'bg-[var(--surface-hover)]' : 'bg-[var(--accent)]/15 ring-1 ring-[var(--accent)]/20'
      }`} aria-hidden="true">
        {isUser ? <User className="h-4 w-4 text-[var(--text-muted-70)]" /> : <Bot className="h-4 w-4 text-[var(--accent)]" />}
      </div>
      <div className={`max-w-[85%] min-w-0 ${isUser ? 'text-right' : 'flex-1'}`}>
        <div className={`flex items-center gap-2 mb-1.5 ${isUser ? 'justify-end' : 'justify-start'}`}>
          <span className="text-xs font-medium text-[var(--text-muted-50)]">
            {isUser ? 'You' : 'JK-TECH-CODE AI Agent'}
          </span>
          {!isUser && (
            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] uppercase tracking-wider font-medium">
              <Sparkles className="h-2.5 w-2.5" />
              Humanized
            </span>
          )}
          <span className="text-[10px] text-[var(--text-muted-30)]">{formatTime(message.timestamp)}</span>
        </div>
        <div className={`inline-block text-left rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-soft ${
          isUser
            ? 'bg-[var(--accent)] text-white rounded-tr-md'
            : message.error
              ? 'bg-[var(--surface)] border border-red-400/40 text-[var(--text-primary)] rounded-tl-md'
              : 'bg-[var(--surface)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-tl-md'
        }`}>
          {isUser ? (
            <span className="whitespace-pre-wrap break-words">{message.content}</span>
          ) : message.error ? (
            <div className="flex items-start gap-2 min-w-[260px] max-w-[420px]">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
              <div className="text-left">
                <p className="text-xs font-medium">{message.errorText || 'Something went wrong while generating a response.'}</p>
                {onRetry && (
                  <button
                    type="button"
                    onClick={() => onRetry(message)}
                    className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent)] hover:underline bg-transparent border-none cursor-pointer p-0"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Retry
                  </button>
                )}
              </div>
            </div>
          ) : message.content ? (
            <div className="markdown-body text-left">
              <ReactMarkdown
                components={{
                  code({ className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || '');
                    if (match) {
                      return <CodeBlock className={className}>{children}</CodeBlock>;
                    }
                    return <code className={className} {...props}>{children}</code>;
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          ) : isStreaming ? (
            <span className="typing-dots" aria-label="Assistant is typing">
              <span /><span /><span />
            </span>
          ) : null}
        </div>
        {!isUser && !isStreaming && message.content && (
          <div className={`mt-1.5 ${isUser ? 'text-right' : 'text-left'}`}>
            <button type="button" onClick={handleCopy}
              className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-[var(--text-muted-30)] hover:text-[var(--accent)] transition-colors bg-transparent border-none cursor-pointer p-0"
              aria-label="Copy response">
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function AutosizeTextarea({
  value, onChange, onKeyDown, textareaRef, ...props
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
} & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'onKeyDown'>) {
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value, textareaRef]);

  return (
    <Textarea ref={textareaRef} value={value} onChange={onChange} onKeyDown={onKeyDown} {...props} />
  );
}

export default function ChatAgent() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

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

  const handleSend = useCallback(async (explicitInput?: string) => {
    const trimmed = (explicitInput ?? input).trim();
    if (!trimmed || loading) return;

    const userMsg: Message = { id: generateId(), role: 'user', content: trimmed, timestamp: Date.now() };
    const assistantId = generateId();
    const assistantMsg: Message = { id: assistantId, role: 'assistant', content: '', timestamp: Date.now() };

    setInput('');
    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setLoading(true);
    setStreamingId(assistantId);

    const abortController = new AbortController();
    abortRef.current = abortController;

    try {
      const allMessages = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));

      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: allMessages }),
        signal: abortController.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Request failed.');
      }

      await readStream(res, {
        onContent: delta => {
          setMessages(prev => prev.map(m =>
            m.id === assistantId ? { ...m, content: m.content + delta } : m
          ));
        },
      });

      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { ...m, content: m.content, timestamp: Date.now(), streaming: false } : m
      ));
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        // Keep whatever streamed so far — never leave a blank assistant bubble.
        setMessages(prev => prev.filter(m => !(m.id === assistantId && !m.content)).map(m =>
          m.id === assistantId ? { ...m, streaming: false } : m
        ));
        toast.info('Stream stopped.');
      } else {
        const message = err instanceof StreamError ? err.message
          : err instanceof Error ? err.message
            : 'Something went wrong. Please try again.';
        console.error('[chat-agent] stream failed:', err);
        setMessages(prev => prev.map(m => {
          if (m.id !== assistantId) return m;
          if (m.content) return { ...m, streaming: false };
          return { ...m, streaming: false, error: true, errorText: message };
        }));
      }
    } finally {
      setLoading(false);
      setStreamingId(null);
      abortRef.current = null;
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [input, loading, messages]);

  const handleRetry = useCallback((failedMsg: Message) => {
    const idx = messages.findIndex(m => m.id === failedMsg.id);
    const precedingUser = [...messages.slice(0, idx)].reverse().find(m => m.role === 'user');
    if (!precedingUser) return;
    setMessages(prev => prev.slice(0, Math.max(0, prev.findIndex(m => m.id === precedingUser.id))));
    void handleSend(precedingUser.content);
  }, [messages, handleSend]);

  const handleSuggestion = useCallback((text: string) => {
    setInput(text);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, []);

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setInput('');
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }, [handleSend]);

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-[600px] lg:h-[700px] bg-[var(--surface)] border border-[var(--border-color)] rounded-2xl overflow-hidden shadow-soft">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border-color)] bg-[var(--surface)]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[var(--accent)]/15 ring-1 ring-[var(--accent)]/20 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-[var(--accent)]" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">AI Agent</h3>
            <p className="text-[10px] text-[var(--text-muted-50)] flex items-center gap-1">
              <Globe className="h-2.5 w-2.5" />Streaming &middot; Auto-humanized
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <>
              <Button variant="ghost" size="icon" onClick={handleNewChat}
                className="h-8 w-8 text-[var(--text-muted-50)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
                aria-label="Start new chat">
                <Plus className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => { setMessages([]); toast.success('Chat cleared.'); }}
                className="h-8 w-8 text-[var(--text-muted-50)] hover:text-red-400 hover:bg-[var(--surface-hover)]"
                aria-label="Clear chat">
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-5" role="log" aria-label="Chat messages" aria-live="polite">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-16 h-16 rounded-2xl bg-[var(--accent)]/10 ring-1 ring-[var(--accent)]/20 flex items-center justify-center mb-6 animate-fade-in-up">
              <Bot className="h-8 w-8 text-[var(--accent)]" />
            </div>
            <h4 className="font-['Playfair_Display'] text-2xl text-[var(--text-primary)] mb-2">Ask me anything</h4>
            <p className="text-sm text-[var(--text-muted-70)] max-w-md mb-8 leading-relaxed">
              Streaming responses in real time. No AI-speak, no buzzwords.
            </p>
            <div className="flex flex-wrap justify-center gap-2 max-w-lg">
              {SUGGESTIONS.map((s, i) => (
                <motion.button
                  key={s} type="button" onClick={() => handleSuggestion(s)}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06, duration: 0.3 }}
                  className="text-xs text-[var(--text-muted-70)] border border-[var(--border-color)] rounded-full px-3.5 py-2 hover:border-[var(--accent)] hover:text-[var(--accent)] hover:bg-[var(--accent)]/5 transition-all duration-200 bg-transparent cursor-pointer">
                  {s}
                </motion.button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto">
            <AnimatePresence initial={false}>
              {messages.map(msg => (
                <MessageBubble key={msg.id} message={msg} onCopy={handleCopy}
                  onRetry={handleRetry}
                  isStreaming={msg.id === streamingId} />
              ))}
            </AnimatePresence>
            {loading && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-3 pl-1"
              >
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--accent)]/15 ring-1 ring-[var(--accent)]/20 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-[var(--accent)]" />
                </div>
                <span className="typing-dots" aria-label="Assistant is typing">
                  <span /><span /><span />
                </span>
              </motion.div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-[var(--border-color)] px-4 py-3.5 bg-[var(--surface)]">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-end gap-2 rounded-2xl border border-[var(--border-color)] bg-[var(--background)] p-2 shadow-soft transition-colors focus-within:border-[var(--accent)]/50 focus-within:ring-1 focus-within:ring-[var(--accent)]/30">
            <AutosizeTextarea
              value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
              textareaRef={textareaRef}
              placeholder="Ask anything — streaming responses..."
              className="flex-1 min-h-[40px] max-h-[160px] resize-none bg-transparent border-none shadow-none px-2 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted-30)] focus-visible:ring-0 focus-visible:border-none"
              rows={1} aria-label="Type your message" />
            {loading ? (
              <Button onClick={handleStop}
                className="flex-shrink-0 h-10 w-10 rounded-xl bg-red-500 hover:bg-red-600 text-white p-0 flex items-center justify-center"
                aria-label="Stop generating">
                <StopCircle className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={() => void handleSend()} disabled={!input.trim()}
                className="flex-shrink-0 h-10 w-10 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white p-0 flex items-center justify-center disabled:opacity-40"
                aria-label="Send message">
                <Send className="h-4 w-4" />
              </Button>
            )}
          </div>
          <p className="text-[10px] text-[var(--text-muted-30)] mt-2 text-center">
            Streaming enabled &middot; Press Enter to send &middot; Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  );
}
