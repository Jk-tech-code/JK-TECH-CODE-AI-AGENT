'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Send, Plus, Copy, Check, Bot, User, Loader2, Trash2, Sparkles, Globe, StopCircle,
} from 'lucide-react';
import { toast } from 'sonner';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
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

function MessageBubble({
  message, onCopy, isStreaming,
}: {
  message: Message; onCopy: (text: string) => void; isStreaming?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  const handleCopy = useCallback(() => {
    onCopy(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [message.content, onCopy]);

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'} mb-6`}>
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-1 ${
        isUser ? 'bg-[var(--surface-hover)]' : 'bg-[var(--accent)]/15'
      }`} aria-hidden="true">
        {isUser ? <User className="h-4 w-4 text-[var(--text-muted-70)]" /> : <Bot className="h-4 w-4 text-[var(--accent)]" />}
      </div>
      <div className={`max-w-[80%] min-w-0 ${isUser ? 'text-right' : ''}`}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium text-[var(--text-muted-50)]">
            {isUser ? 'You' : 'JK-TECH-CODE AI Agent'}
          </span>
          {!isUser && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent)]/10 text-[var(--accent)] uppercase tracking-wider font-medium">
              Humanized
            </span>
          )}
          <span className="text-[10px] text-[var(--text-muted-30)]">{formatTime(message.timestamp)}</span>
        </div>
        <div className={`inline-block text-left rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words ${
          isUser
            ? 'bg-[var(--accent)] text-white rounded-tr-md'
            : 'bg-[var(--surface)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-tl-md'
        }`}>
          {message.content}
          {isStreaming && <span className="inline-block w-1.5 h-4 bg-[var(--accent)] ml-0.5 animate-pulse" />}
        </div>
        {!isUser && !isStreaming && (
          <div className="mt-1.5">
            <button type="button" onClick={handleCopy}
              className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-[var(--text-muted-30)] hover:text-[var(--accent)] transition-colors bg-transparent border-none cursor-pointer p-0"
              aria-label="Copy response">
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        )}
      </div>
    </div>
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

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
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
                m.id === assistantId ? { ...m, content: fullContent } : m
              ));
            }
          } catch (e) { console.warn('[chat-agent] failed to parse SSE chunk:', e); }
        }
      }

      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { ...m, content: fullContent, timestamp: Date.now() } : m
      ));
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
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [input, loading, messages]);

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
    <div className="flex flex-col h-[600px] lg:h-[700px] bg-[var(--surface)] border border-[var(--border-color)] rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border-color)] bg-[var(--surface)]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[var(--accent)]/15 flex items-center justify-center">
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

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4" role="log" aria-label="Chat messages" aria-live="polite">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-14 h-14 rounded-2xl bg-[var(--accent)]/10 flex items-center justify-center mb-5">
              <Bot className="h-7 w-7 text-[var(--accent)]" />
            </div>
            <h4 className="font-['Playfair_Display'] text-xl text-[var(--text-primary)] mb-2">Ask me anything</h4>
            <p className="text-sm text-[var(--text-muted-70)] max-w-md mb-8 leading-relaxed">
              Streaming responses in real time. No AI-speak, no buzzwords.
            </p>
            <div className="flex flex-wrap justify-center gap-2 max-w-lg">
              {SUGGESTIONS.map(s => (
                <button key={s} type="button" onClick={() => handleSuggestion(s)}
                  className="text-xs text-[var(--text-muted-70)] border border-[var(--border-color)] rounded-full px-3.5 py-2 hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors bg-transparent cursor-pointer">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto">
            {messages.map(msg => (
              <MessageBubble key={msg.id} message={msg} onCopy={handleCopy}
                isStreaming={msg.id === streamingId} />
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-[var(--border-color)] px-5 py-3.5 bg-[var(--surface)]">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-end gap-3">
            <Textarea ref={textareaRef} value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything — streaming responses..."
              className="flex-1 min-h-[44px] max-h-[120px] resize-none bg-[var(--background)] border border-[var(--border-color)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted-30)] focus-visible:ring-1 focus-visible:ring-[var(--accent)] focus-visible:border-transparent"
              rows={1} aria-label="Type your message" />
            {loading ? (
              <Button onClick={handleStop}
                className="flex-shrink-0 h-11 w-11 rounded-xl bg-red-500 hover:bg-red-600 text-white p-0 flex items-center justify-center"
                aria-label="Stop generating">
                <StopCircle className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={handleSend} disabled={!input.trim()}
                className="flex-shrink-0 h-11 w-11 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white p-0 flex items-center justify-center"
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
