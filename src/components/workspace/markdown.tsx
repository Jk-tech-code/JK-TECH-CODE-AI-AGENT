'use client';

import { useState, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useTheme } from 'next-themes';
import { Check, Copy, FileCode2 } from 'lucide-react';

interface CodeBlockProps {
  className?: string;
  children?: React.ReactNode;
}

function CodeBlock({ className, children }: CodeBlockProps) {
  const { resolvedTheme } = useTheme();
  const [copied, setCopied] = useState(false);
  const isDark = resolvedTheme === 'dark';
  const code = String(children || '').replace(/\n$/, '');
  const lang = (className || '').replace(/^language-/, '') || 'text';

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="group relative my-3 overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--code-bg)]">
      <div className="flex items-center justify-between border-b border-[var(--border-color)] bg-[var(--surface-accent)] px-3 py-2">
        <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-[var(--text-muted-50)]">
          <FileCode2 className="h-3.5 w-3.5" />
          {lang}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label={`Copy ${lang} code`}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-[var(--text-muted-50)] transition-colors hover:bg-[var(--surface-accent)] hover:text-[var(--accent)]"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <SyntaxHighlighter
        language={lang}
        style={isDark ? oneDark : oneLight}
        customStyle={{
          margin: 0,
          padding: '0.9rem 1rem',
          background: 'transparent',
          fontSize: '0.8rem',
          lineHeight: 1.65,
        }}
        codeTagProps={{
          style: { fontFamily: 'var(--font-mono)' },
        }}
        wrapLongLines={false}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="markdown-body text-left">
      <ReactMarkdown
        components={{
          code({ className, children, ...props }) {
            const isBlock = /language-/.test(className || '');
            if (isBlock) {
              return <CodeBlock className={className}>{children}</CodeBlock>;
            }
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          pre({ children }) {
            return <>{children}</>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export const Markdown = memo(MarkdownContent);