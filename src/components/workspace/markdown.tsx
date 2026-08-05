'use client';

import { useState, memo, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useTheme } from 'next-themes';
import { Check, Copy, FileCode2, Workflow } from 'lucide-react';

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
import markdownLang from 'react-syntax-highlighter/dist/esm/languages/prism/markdown';

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
SyntaxHighlighter.registerLanguage('markdown', markdownLang);

interface CodeBlockProps {
  className?: string;
  children?: React.ReactNode;
}

/** Lazy-loaded Mermaid diagram renderer (kept out of the main bundle). */
function MermaidBlock({ code }: { code: string }) {
  const { resolvedTheme } = useTheme();
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const idRef = useRef(`mermaid-${Math.random().toString(36).slice(2, 9)}`);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          // Strict sanitization — model-generated diagrams could otherwise
          // inject script into the rendered SVG.
          securityLevel: 'strict',
          theme: resolvedTheme === 'dark' ? 'dark' : 'default',
          fontFamily: 'var(--font-sans)',
        });
        const { svg: rendered } = await mermaid.render(idRef.current, code);
        if (!cancelled) setSvg(rendered);
      } catch (err) {
        console.error('[mermaid] render failed:', err);
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, resolvedTheme]);

  if (failed) {
    return (
      <div className="mermaid-block">
        <div className="mermaid-block__header">
          <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-[var(--text-muted-50)]">
            <Workflow className="h-3.5 w-3.5" /> mermaid
          </span>
        </div>
        <pre className="p-3 text-xs text-[var(--text-muted-70)] overflow-x-auto whitespace-pre">{code}</pre>
      </div>
    );
  }

  return (
    <div className="mermaid-block">
      <div className="mermaid-block__header">
        <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-[var(--text-muted-50)]">
          <Workflow className="h-3.5 w-3.5" /> Diagram
        </span>
      </div>
      <div
        className="mermaid-block__body"
        aria-label="Mermaid diagram"
        dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
      >
        {!svg && <span className="text-xs text-[var(--text-muted-50)]">Rendering diagram…</span>}
      </div>
    </div>
  );
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

/** Recursively extracts plain text from a hast node (used for language-less code blocks). */
function hastText(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const n = node as { type?: string; value?: string; children?: unknown[] };
  if (n.type === 'text' && typeof n.value === 'string') return n.value;
  if (Array.isArray(n.children)) return n.children.map(hastText).join('');
  return '';
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="markdown-body text-left">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          code({ className, children, ...props }) {
            const isMermaid = /language-mermaid/.test(className || '');
            if (isMermaid) {
              return <MermaidBlock code={String(children || '')} />;
            }
            if (/language-/.test(className || '')) {
              return <CodeBlock className={className}>{children}</CodeBlock>;
            }
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          pre({ children, node }) {
            // Fenced code blocks with no language produce a bare <pre><code>.
            // Render them as a styled block instead of unwrapped inline code.
            const codeChild = node?.children?.[0] as
              | { type?: string; tagName?: string; properties?: { className?: unknown }; children?: unknown[] }
              | undefined;
            const className = Array.isArray(codeChild?.properties?.className)
              ? (codeChild.properties.className as string[]).join(' ')
              : '';
            if (codeChild?.type === 'element' && codeChild.tagName === 'code' && !/language-/.test(className)) {
              return (
                <pre className="my-3 overflow-x-auto rounded-xl border border-[var(--border-color)] bg-[var(--code-bg)] p-3.5">
                  <code className="font-mono text-[0.8rem] leading-relaxed text-[var(--text-primary)]">
                    {hastText(codeChild)}
                  </code>
                </pre>
              );
            }
            return <>{children}</>;
          },
          table({ children }) {
            return (
              <div className="table-wrapper">
                <table>{children}</table>
              </div>
            );
          },
          img({ src, alt }) {
            const href = typeof src === 'string' ? src : undefined;
            return (
              <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`Open image: ${alt || href || ''}`}>
                <img
                  src={href}
                  alt={alt || ''}
                  loading="lazy"
                  className="my-2 max-h-96 rounded-xl border border-[var(--border-color)]"
                />
              </a>
            );
          },
          a({ children, href, ...props }) {
            const isExternal = /^https?:\/\//.test(href || '');
            return (
              <a
                href={href}
                {...props}
                {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              >
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export const Markdown = memo(MarkdownContent);
