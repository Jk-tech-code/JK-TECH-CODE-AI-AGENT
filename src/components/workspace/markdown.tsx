'use client';

import { useState, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useTheme } from 'next-themes';
import { Check, Copy, FileCode2 } from 'lucide-react';

import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx';
import tsx from 'react-syntax-highlighter/dist/esm/languages/prism/tsx';
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash';
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css';
import markup from 'react-syntax-highlighter/dist/esm/languages/prism/markup';
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql';
import java from 'react-syntax-highlighter/dist/esm/languages/prism/java';
import csharp from 'react-syntax-highlighter/dist/esm/languages/prism/csharp';
import go from 'react-syntax-highlighter/dist/esm/languages/prism/go';
import rust from 'react-syntax-highlighter/dist/esm/languages/prism/rust';
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml';
import graphql from 'react-syntax-highlighter/dist/esm/languages/prism/graphql';
import cpp from 'react-syntax-highlighter/dist/esm/languages/prism/cpp';
import markdown from 'react-syntax-highlighter/dist/esm/languages/prism/markdown';

SyntaxHighlighter.registerLanguage('javascript', javascript);
SyntaxHighlighter.registerLanguage('typescript', typescript);
SyntaxHighlighter.registerLanguage('jsx', jsx);
SyntaxHighlighter.registerLanguage('tsx', tsx);
SyntaxHighlighter.registerLanguage('python', python);
SyntaxHighlighter.registerLanguage('json', json);
SyntaxHighlighter.registerLanguage('bash', bash);
SyntaxHighlighter.registerLanguage('shell', bash);
SyntaxHighlighter.registerLanguage('css', css);
SyntaxHighlighter.registerLanguage('html', markup);
SyntaxHighlighter.registerLanguage('xml', markup);
SyntaxHighlighter.registerLanguage('sql', sql);
SyntaxHighlighter.registerLanguage('java', java);
SyntaxHighlighter.registerLanguage('csharp', csharp);
SyntaxHighlighter.registerLanguage('go', go);
SyntaxHighlighter.registerLanguage('rust', rust);
SyntaxHighlighter.registerLanguage('yaml', yaml);
SyntaxHighlighter.registerLanguage('graphql', graphql);
SyntaxHighlighter.registerLanguage('cpp', cpp);
SyntaxHighlighter.registerLanguage('markdown', markdown);

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
