'use client';

import { motion } from 'framer-motion';
import { Code2, FileSearch, FileText, Globe, PenTool, Rocket } from 'lucide-react';

const SUGGESTIONS = [
  { icon: Rocket, label: 'What would you like to build today?', prompt: 'I want to build a website for my business. Help me plan and code it step by step.' },
  { icon: PenTool, label: 'Write a proposal', prompt: 'Write a professional business proposal for my service offering.' },
  { icon: FileText, label: 'Analyze a PDF', prompt: 'Explain how to analyze a PDF document with AI and extract its key insights.' },
  { icon: Code2, label: 'Generate code', prompt: 'Generate a React component with TypeScript for a data table with sorting and pagination.' },
  { icon: Globe, label: 'Research a topic', prompt: 'Research the latest trends in AI and summarize the key takeaways.' },
  { icon: FileSearch, label: 'Summarize a document', prompt: 'What are the best techniques to summarize long documents with AI?' },
];

export function EmptyState({ onPrompt }: { onPrompt: (prompt: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-4 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--accent)]/10 ring-1 ring-[var(--accent)]/20"
      >
        <Rocket className="h-8 w-8 text-[var(--accent)]" />
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="font-['Playfair_Display'] text-2xl font-bold text-[var(--text-primary)] sm:text-3xl"
      >
        How can I help you today?
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="mt-2 max-w-md text-sm text-[var(--text-muted-70)]"
      >
        Ask anything — JK-TECH-CODE AI writes, codes, researches, and sounds human. Just like you.
      </motion.p>

      <div className="mt-8 grid w-full max-w-xl grid-cols-1 gap-2.5 sm:grid-cols-2">
        {SUGGESTIONS.map((s, i) => (
          <motion.button
            key={s.label}
            type="button"
            onClick={() => onPrompt(s.prompt)}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 + i * 0.05, duration: 0.3 }}
            className="group flex items-center gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--surface)] px-4 py-3 text-left transition-all hover:border-[var(--accent)]/40 hover:bg-[var(--surface-hover)]"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-accent)]">
              <s.icon className="h-4 w-4 text-[var(--accent)]" />
            </span>
            <span className="text-[13px] font-medium text-[var(--text-muted-70)] group-hover:text-[var(--text-primary)]">
              {s.label}
            </span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}