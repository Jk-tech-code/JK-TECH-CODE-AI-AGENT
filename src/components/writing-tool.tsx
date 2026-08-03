'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, Check, Sparkles, RotateCcw, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';

interface Change {
  original: string;
  replacement: string;
  reason: string;
}

interface HumanizeResult {
  humanized: string;
  changes: Change[];
}

const DEFAULT_TEXT = `It is important to note that effective communication plays a pivotal role in fostering successful relationships, whether you're a manager, entrepreneur, or freelancer. Moreover, in today's rapidly evolving landscape, leveraging modern tools can significantly enhance collaborative outcomes.`;

export default function WritingTool() {
  const [input, setInput] = useState(DEFAULT_TEXT);
  const [result, setResult] = useState<HumanizeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expandedChanges, setExpandedChanges] = useState(true);
  const resultRef = useRef<HTMLDivElement>(null);

  const humanize = useCallback(async () => {
    if (input.trim().length < 10) {
      toast.error('Please write at least 10 characters.');
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/humanize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: input }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Something went wrong.');
        return;
      }
      setResult(data);
      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
    } catch {
      toast.error('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [input]);

  const handleCopy = useCallback(async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.humanized);
      setCopied(true);
      toast.success('Copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy.');
    }
  }, [result]);

  const handleReset = useCallback(() => {
    setInput('');
    setResult(null);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        humanize();
      }
    },
    [humanize]
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const active = document.activeElement;
        if (active && active.tagName === 'TEXTAREA') {
          (active as HTMLElement).blur();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 border border-[var(--border-color)] rounded-lg overflow-hidden">
      {/* Input Panel */}
      <div className="bg-[var(--surface)] p-6 lg:p-8 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <label htmlFor="input-text" className="text-xs uppercase tracking-[0.15em] text-[var(--muted-label)]">
            Your Text
          </label>
          <Badge
            variant="outline"
            className="text-[10px] px-2 py-0 border-[var(--border-color)] text-[var(--muted-label)]"
          >
            {input.length} chars
          </Badge>
        </div>
        <Textarea
          id="input-text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Paste your writing here..."
          className="flex-1 min-h-[240px] lg:min-h-[300px] resize-y bg-transparent border-none text-[var(--text-primary)] placeholder:text-[var(--text-muted-30)] focus-visible:ring-0 p-0 text-[0.95rem] leading-relaxed"
          aria-label="Enter the text you want to humanize"
        />
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-[var(--border-color)]">
          <span className="text-xs text-[var(--text-muted-50)]">
            <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-hover)] text-[10px] font-mono">Ctrl</kbd>{' '}
            <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-hover)] text-[10px] font-mono">Enter</kbd>{' '}
            to submit
          </span>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="text-[var(--text-muted-70)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
              aria-label="Clear text"
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              Clear
            </Button>
            <Button
              onClick={humanize}
              disabled={loading || input.trim().length < 10}
              className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold text-sm"
              aria-label="Humanize your text"
            >
              {loading ? (
                <>
                  <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-1.5" />
                  Humanize
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Output Panel */}
      <div
        className="bg-[var(--surface-accent)] p-6 lg:p-8 flex flex-col border-l-0 lg:border-l-[3px] lg:border-l-[var(--accent)]"
        ref={resultRef}
      >
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs uppercase tracking-[0.15em] text-[var(--muted-label)]">
            Humanized Result
          </span>
          {result && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              className="text-[var(--text-muted-70)] hover:text-[var(--accent)] hover:bg-transparent h-auto p-0"
              aria-label={copied ? 'Copied' : 'Copy result to clipboard'}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          )}
        </div>

        <div className="flex-1 min-h-[240px] lg:min-h-[300px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <div className="h-8 w-8 border-2 border-[var(--accent)]/30 border-t-[var(--accent)] rounded-full animate-spin" />
              <p className="text-sm text-[var(--text-muted-50)]">Analyzing patterns and rewriting...</p>
            </div>
          ) : result ? (
            <div>
              <p className="text-[0.95rem] leading-[1.8] text-[var(--text-primary)] whitespace-pre-wrap">
                {result.humanized}
              </p>

              {result.changes.length > 0 && (
                <div className="mt-6 pt-4 border-t border-[var(--border-color)]">
                  <button
                    type="button"
                    onClick={() => setExpandedChanges(!expandedChanges)}
                    className="flex items-center gap-1.5 text-xs uppercase tracking-[0.12em] text-[var(--accent)] hover:underline mb-3 bg-transparent border-none cursor-pointer p-0"
                    aria-expanded={expandedChanges}
                    aria-controls="changes-list"
                  >
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {result.changes.length} change{result.changes.length !== 1 ? 's' : ''} detected
                    {expandedChanges ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>
                  {expandedChanges && (
                    <ul id="changes-list" className="space-y-3" role="list">
                      {result.changes.map((c, i) => (
                        <li
                          key={i}
                          className="text-sm border-l-2 border-[var(--accent)]/30 pl-3"
                        >
                          <span className="text-[var(--text-muted-50)] line-through">{c.original}</span>{' '}
                          <span className="text-[var(--accent)] font-medium">{c.replacement}</span>
                          <p className="text-[var(--text-muted-70)] text-xs mt-1">{c.reason}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-[var(--text-muted-30)] text-sm italic">
                JK-TECH-CODE will show your humanized text here.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
