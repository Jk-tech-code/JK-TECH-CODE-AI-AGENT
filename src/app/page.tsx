'use client';

import React, { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
  SheetClose,
} from '@/components/ui/sheet';
import { Menu, X, ArrowRight, Sparkles, MessageSquare } from 'lucide-react';
import WritingTool from '@/components/writing-tool';
import ChatAgent from '@/components/chat-agent';

/* ─── prefers-reduced-motion hook ─── */
function usePrefersReducedMotion() {
  const getSnapshot = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const getServerSnapshot = () => false;
  const subscribe = (cb: () => void) => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    mql.addEventListener('change', cb);
    return () => mql.removeEventListener('change', cb);
  };
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/* ─── scroll-triggered fade-in ─── */
function FadeIn({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const prefersReduced = usePrefersReducedMotion();
  const [visible, setVisible] = useState(prefersReduced);

  useEffect(() => {
    if (prefersReduced) return;
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.unobserve(el); } },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [prefersReduced]);

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

/* ─── typewriter demo ─── */
const TYPEWRITER_PHRASES = [
  { ai: 'By leveraging our robust ecosystem of cutting-edge solutions...', fix: 'Our tools help teams get work done.' },
  { ai: 'It is important to note that effective communication is pivotal...', fix: 'Good communication matters.' },
  { ai: "In today's rapidly evolving digital landscape...", fix: 'Things are changing fast.' },
  { ai: 'Moreover, fostering a holistic approach to transformative innovation...', fix: 'A broad approach works best.' },
];

function TypewriterDemo() {
  const [display, setDisplay] = useState({ text: '', className: 'text-[var(--text-muted-50)]' });
  const [cursorVisible, setCursorVisible] = useState(true);
  const phraseRef = useRef(0);
  const charRef = useRef(0);
  const deletingRef = useRef(false);
  const runningRef = useRef(true);

  const prefersReduced = usePrefersReducedMotion();

  useEffect(() => {
    if (prefersReduced) return;


    const cursorInterval = setInterval(() => setCursorVisible(v => !v), 800);

    function step() {
      if (!runningRef.current) return;
      const phrase = TYPEWRITER_PHRASES[phraseRef.current];
      const target = deletingRef.current ? phrase.fix : phrase.ai;

      if (!deletingRef.current) {
        charRef.current++;
        if (charRef.current > target.length) {
          // Finished typing AI phrase, pause then delete
          setTimeout(() => { deletingRef.current = true; step(); }, 1800);
          return;
        }
      } else {
        charRef.current--;
        if (charRef.current < 0) {
          // Finished deleting, show the fix
          setDisplay({ text: phrase.fix, className: 'text-[var(--accent)]' });
          setTimeout(() => {
            charRef.current = 0;
            deletingRef.current = false;
            phraseRef.current = (phraseRef.current + 1) % TYPEWRITER_PHRASES.length;
            setDisplay({ text: '', className: '' });
            setTimeout(step, 400);
          }, 1800);
          return;
        }
      }

      const isDeleting = deletingRef.current;
      const txt = target.slice(0, charRef.current);
      setDisplay({
        text: txt,
        className: isDeleting ? 'text-[var(--accent)]' : 'text-[var(--text-muted-50)]',
      });

      const speed = isDeleting ? 18 + Math.random() * 14 : 35 + Math.random() * 25;
      setTimeout(step, speed);
    }

    // Show first AI phrase briefly then start
    const showInitial = () => {
      setDisplay({ text: TYPEWRITER_PHRASES[0].ai, className: 'text-[var(--text-muted-50)]' });
      setTimeout(() => {
        setDisplay({ text: TYPEWRITER_PHRASES[0].fix, className: 'text-[var(--accent)]' });
        setTimeout(() => {
          charRef.current = 0;
          phraseRef.current = 1;
          deletingRef.current = false;
          setDisplay({ text: '', className: '' });
          setTimeout(step, 400);
        }, 1800);
      }, 2000);
    };
    showInitial();

    return () => {
      runningRef.current = false;
      clearInterval(cursorInterval);
    };
  }, [prefersReduced]);

  return (
    <div className="bg-[var(--surface)] border border-[var(--border-color)] p-8 min-h-[320px] flex flex-col justify-center rounded-lg">
      <span className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted-label)] mb-4">
        Live Detection
      </span>
      <p
        className="font-['Playfair_Display'] text-xl leading-relaxed min-h-[4.8em] break-words"
        aria-live="polite"
        aria-atomic="true"
      >
        <span className={display.className}>{display.text}</span>
        <span
          className={`inline-block w-0.5 h-5 bg-[var(--accent)] ml-0.5 align-text-bottom ${cursorVisible ? 'opacity-100' : 'opacity-0'}`}
          aria-hidden="true"
        />
      </p>
      <p className="text-xs text-[var(--text-muted-30)] mt-5 italic">
        JK-TECH-CODE flags patterns in real time
      </p>
    </div>
  );
}

/* ─── animated counter ─── */
function AnimatedCounter({ target, suffix = '' }: { target: number; suffix?: string }) {
  const prefersReduced = usePrefersReducedMotion();
  const [value, setValue] = useState(prefersReduced ? target : 0);
  const ref = useRef<HTMLSpanElement>(null);
  const animated = useRef(false);

  useEffect(() => {
    if (prefersReduced) return;
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !animated.current) {
          animated.current = true;
          const start = performance.now();
          const duration = 2000;
          function update(now: number) {
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setValue(Math.floor(eased * target));
            if (progress < 1) requestAnimationFrame(update);
            else setValue(target);
          }
          requestAnimationFrame(update);
          obs.unobserve(el);
        }
      },
      { threshold: 0.3 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [target]);

  return (
    <span ref={ref} className="font-['Playfair_Display'] text-5xl lg:text-6xl text-[var(--accent)] leading-none mb-2">
      {value.toLocaleString()}{suffix}
    </span>
  );
}

/* ─── research pair ─── */
function ResearchPair({ aiText, humanText }: { aiText: string; humanText: string }) {
  return (
    <div className="mb-6 pl-5 border-l-2 border-[var(--accent)]/15">
      <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--accent)]/40 mb-1 block">AI pattern</span>
      <p className="text-[var(--text-muted-50)] italic text-sm mb-1">{aiText}</p>
      <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--accent)] mb-1 block">Sounds more human</span>
      <p className="text-[var(--text-primary)] text-sm">{humanText}</p>
    </div>
  );
}

/* ─── nav links data ─── */
const NAV_LINKS = [
  { label: 'Process', href: '#workflow' },
  { label: 'Try It', href: '#canvas' },
  { label: 'AI Agent', href: '#agent' },
  { label: 'Research', href: '#research' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Sign In', href: '/login' },
];

/* ═══════════════════════════════════════════════════════════════ */
export default function Home() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [yearly, setYearly] = useState(false);

  const scrollTo = useCallback((href: string) => {
    setMobileOpen(false);
    const el = document.querySelector(href);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    document.documentElement.style.scrollBehavior = 'smooth';
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Skip to content */}
      <a href="#main-content" className="skip-to-content">
        Skip to content
      </a>

      {/* ─── HEADER / NAV ─── */}
      <header className="fixed top-0 left-0 right-0 z-50 h-16 bg-[var(--background)]/95 backdrop-blur-sm border-b border-[var(--border-color)] flex items-center px-6">
        <nav
          className="max-w-7xl w-full mx-auto flex items-center justify-between"
          aria-label="Main navigation"
        >
          <a href="#hero" className="font-['Playfair_Display'] font-bold text-lg text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors">
            JK-TECH-CODE<span className="text-[var(--accent)]">.</span>
          </a>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map(link => (
              <a
                key={link.href}
                href={link.href}
                className="text-xs uppercase tracking-[0.12em] text-[var(--text-muted-70)] hover:text-[var(--accent)] transition-colors font-normal"
              >
                {link.label}
              </a>
            ))}
            <Button
              onClick={() => scrollTo('#canvas')}
              className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold text-xs uppercase tracking-[0.08em] px-5 py-2 h-9"
            >
              Get Started
            </Button>
          </div>

          {/* Mobile hamburger */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
                aria-label="Open navigation menu"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="bg-[var(--surface)] border-l border-[var(--border-color)] w-72">
              <SheetTitle className="font-['Playfair_Display'] font-bold text-lg text-[var(--text-primary)] mb-8">
                JK-TECH-CODE<span className="text-[var(--accent)]">.</span>
              </SheetTitle>
              <div className="flex flex-col gap-2">
                {NAV_LINKS.map(link => (
                  <SheetClose asChild key={link.href}>
                    <button
                      type="button"
                      onClick={() => scrollTo(link.href)}
                      className="text-left text-base text-[var(--text-muted-70)] hover:text-[var(--accent)] transition-colors py-3 px-3 rounded-md hover:bg-[var(--surface-hover)] w-full"
                    >
                      {link.label}
                    </button>
                  </SheetClose>
                ))}
                <SheetClose asChild>
                  <Button
                    onClick={() => scrollTo('#canvas')}
                    className="mt-4 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold text-sm uppercase tracking-[0.08em] w-full"
                  >
                    Get Started
                  </Button>
                </SheetClose>
              </div>
            </SheetContent>
          </Sheet>
        </nav>
      </header>

      {/* ─── MAIN ─── */}
      <main id="main-content" className="flex-1">

        {/* HERO */}
        <section id="hero" className="min-h-screen flex items-center pt-16">
          <div className="max-w-7xl mx-auto px-6 w-full grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center py-20">
            <div>
              <FadeIn>
                <span className="text-xs uppercase tracking-[0.2em] text-[var(--accent)] font-semibold block mb-6">
                  AI Writing Detector &amp; Fixer
                </span>
              </FadeIn>
              <FadeIn delay={100}>
                <h1 className="font-['Playfair_Display'] italic text-4xl sm:text-5xl lg:text-6xl leading-tight mb-6">
                  Write like a human.<br />Not like a machine.
                </h1>
              </FadeIn>
              <FadeIn delay={200}>
                <p className="text-[var(--text-muted-70)] text-lg max-w-md leading-relaxed mb-10">
                  JK-TECH-CODE scans your text for the patterns that give away AI-generated writing.
                  Then shows you how to fix them — one sentence at a time.
                </p>
              </FadeIn>
              <FadeIn delay={300}>
                <Button
                  onClick={() => scrollTo('#canvas')}
                  className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold text-sm uppercase tracking-[0.08em] px-10 py-3.5 h-auto"
                  size="lg"
                >
                  See It Work <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </FadeIn>
            </div>
            <FadeIn delay={200}>
              <TypewriterDemo />
            </FadeIn>
          </div>
        </section>

        {/* SOCIAL PROOF */}
        <section className="py-16 text-center border-b border-[var(--border-color)]" aria-label="Trusted by">
          <FadeIn>
            <span className="text-xs uppercase tracking-[0.2em] text-[var(--muted-label)] block mb-8">
              Trusted by writers at
            </span>
            <div className="flex justify-center items-center flex-wrap gap-12">
              {['The Atlantic', 'Wired', 'Harvard Business Review', 'The Guardian', 'MIT Technology Review'].map(name => (
                <span key={name} className="font-['Playfair_Display'] italic text-lg text-[var(--text-muted-30)] whitespace-nowrap">
                  {name}
                </span>
              ))}
            </div>
          </FadeIn>
        </section>

        {/* HOW IT WORKS */}
        <section id="workflow" className="py-24 border-b border-[var(--border-color)]">
          <div className="max-w-7xl mx-auto px-6">
            <FadeIn>
              <span className="text-xs uppercase tracking-[0.2em] text-[var(--accent)] font-semibold block mb-4">
                How It Works
              </span>
            </FadeIn>
            <FadeIn delay={100}>
              <h2 className="font-['Playfair_Display'] text-3xl sm:text-4xl mb-3">Three steps.</h2>
            </FadeIn>
            <FadeIn delay={200}>
              <p className="text-[var(--text-muted-70)] max-w-lg text-base leading-relaxed mb-16">
                No accounts. No setup. Paste your text and JK-TECH-CODE shows you what sounds like a robot wrote it.
              </p>
            </FadeIn>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-12 lg:gap-16">
              {[
                { num: '01', title: 'Paste your draft', desc: 'Blog posts, emails, LinkedIn updates, scripts. Anything you want to sound natural and authentic.' },
                { num: '02', title: 'JK-TECH-CODE scans it', desc: 'It finds overused transitions, forced phrases, balanced sentences. The patterns that feel hollow and rehearsed.' },
                { num: '03', title: 'Get natural alternatives', desc: 'Specific rewrites that preserve your meaning but sound like a real person wrote them. Not a template.' },
              ].map((step, i) => (
                <FadeIn key={step.num} delay={i * 150}>
                  <div className="relative pt-10">
                    <span className="absolute top-0 left-0 font-['Playfair_Display'] text-5xl text-[var(--accent)] opacity-30 leading-none" aria-hidden="true">
                      {step.num}
                    </span>
                    <h3 className="font-['Playfair_Display'] text-xl mb-3">{step.title}</h3>
                    <p className="text-[var(--text-muted-70)] text-sm leading-relaxed">{step.desc}</p>
                  </div>
                </FadeIn>
              ))}
            </div>
          </div>
        </section>

        {/* INTERACTIVE WRITING TOOL */}
        <section id="canvas" className="py-24 border-b border-[var(--border-color)]">
          <div className="max-w-7xl mx-auto px-6">
            <FadeIn>
              <span className="text-xs uppercase tracking-[0.2em] text-[var(--accent)] font-semibold block mb-4">
                Interactive Preview
              </span>
            </FadeIn>
            <FadeIn delay={100}>
              <h2 className="font-['Playfair_Display'] text-3xl sm:text-4xl mb-3">
                Paste something. See what JK-TECH-CODE catches.
              </h2>
            </FadeIn>
            <FadeIn delay={200}>
              <p className="text-[var(--text-muted-70)] max-w-2xl text-base leading-relaxed mb-12">
                Try an AI-generated paragraph or your own writing. The editor analyzes patterns
                and suggests human-sounding alternatives in real time.
              </p>
            </FadeIn>
            <FadeIn delay={300}>
              <WritingTool />
            </FadeIn>
          </div>
        </section>

        {/* AI AGENT */}
        <section id="agent" className="py-24 border-b border-[var(--border-color)]">
          <div className="max-w-5xl mx-auto px-6">
            <FadeIn>
              <span className="text-xs uppercase tracking-[0.2em] text-[var(--accent)] font-semibold block mb-4">
                JK-TECH-CODE AI Agent
              </span>
            </FadeIn>
            <FadeIn delay={100}>
              <h2 className="font-['Playfair_Display'] text-3xl sm:text-4xl mb-3">
                Ask anything. Get human-sounding answers.
              </h2>
            </FadeIn>
            <FadeIn delay={200}>
              <p className="text-[var(--text-muted-70)] max-w-2xl text-base leading-relaxed mb-4">
                Like ChatGPT, Claude, Gemini, DeepSeek v4 Pro, or GLM-5.2 — but every response is automatically written to sound
                like a real person. No AI buzzwords, no robotic phrasing. The agent searches the web
                for the latest info, then delivers clear, natural answers you can use right away.
              </p>
            </FadeIn>
            <FadeIn delay={250}>
              <div className="flex items-center gap-4 mb-10">
                <span className="inline-flex items-center gap-1.5 text-xs text-[var(--accent)] bg-[var(--accent)]/10 px-3 py-1.5 rounded-full">
                  <MessageSquare className="h-3 w-3" />
                  Web Search Built In
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs text-[var(--accent)] bg-[var(--accent)]/10 px-3 py-1.5 rounded-full">
                  <Sparkles className="h-3 w-3" />
                  Auto-Humanized Output
                </span>
              </div>
            </FadeIn>
            <FadeIn delay={300}>
              <ChatAgent />
            </FadeIn>
          </div>
        </section>

        {/* STATS */}
        <section id="results" className="py-24 border-b border-[var(--border-color)]">
          <div className="max-w-7xl mx-auto px-6 text-center">
            <FadeIn>
              <span className="text-xs uppercase tracking-[0.2em] text-[var(--accent)] font-semibold block mb-4">
                Customer Results
              </span>
            </FadeIn>
            <FadeIn delay={100}>
              <h2 className="font-['Playfair_Display'] text-3xl sm:text-4xl mb-3">By the numbers.</h2>
            </FadeIn>
            <FadeIn delay={200}>
              <p className="text-[var(--text-muted-70)] max-w-md mx-auto text-base leading-relaxed mb-16">
                People who use JK-TECH-CODE write differently after a few weeks.
              </p>
            </FadeIn>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
              <FadeIn delay={100}>
                <div className="text-center">
                  <AnimatedCounter target={1270000} suffix="+" />
                  <p className="text-sm text-[var(--text-muted-70)]">Words analyzed and rewritten</p>
                </div>
              </FadeIn>
              <FadeIn delay={250}>
                <div className="text-center">
                  <AnimatedCounter target={86} suffix="%" />
                  <p className="text-sm text-[var(--text-muted-70)]">Say their writing sounds more natural</p>
                </div>
              </FadeIn>
              <FadeIn delay={400}>
                <div className="text-center">
                  <AnimatedCounter target={3400} suffix="+" />
                  <p className="text-sm text-[var(--text-muted-70)]">Writers and editors use JK-TECH-CODE</p>
                </div>
              </FadeIn>
            </div>
          </div>
        </section>

        {/* RESEARCH */}
        <section id="research" className="py-24 border-b border-[var(--border-color)]">
          <div className="max-w-7xl mx-auto px-6">
            <FadeIn>
              <span className="text-xs uppercase tracking-[0.2em] text-[var(--accent)] font-semibold block mb-4">
                Anti-AI Writing Research
              </span>
            </FadeIn>
            <FadeIn delay={100}>
              <h2 className="font-['Playfair_Display'] text-3xl sm:text-4xl mb-6">How to spot machine writing.</h2>
            </FadeIn>
            <FadeIn delay={200}>
              <div className="max-w-2xl mb-16">
                <p className="text-[var(--text-muted-70)] text-base leading-relaxed">
                  Researchers have spent years studying what makes AI text feel off. The answer is rarely one word.
                  It is usually a pattern: too many smooth transitions, sentences that are all the same length,
                  examples that could apply to anything, and a tone that never takes a side.
                </p>
                <p className="text-[var(--text-muted-70)] text-base leading-relaxed mt-4">
                  Below is a field guide. Every pattern JK-TECH-CODE looks for.
                </p>
              </div>
            </FadeIn>

            <div className="space-y-14">
              {/* Cat 1: Words AI leans on */}
              <FadeIn>
                <div>
                  <span className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted-label)] block mb-3">Category 1</span>
                  <h3 className="font-['Playfair_Display'] text-2xl mb-2">Words AI leans on</h3>
                  <p className="text-[var(--text-muted-70)] text-sm mb-5">
                    These show up in AI text across blogs, emails, scripts, and social posts. Not always. Often enough to notice.
                  </p>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2" role="list">
                    {[
                      'leverage', 'optimize', 'streamline', 'facilitate', 'foster', 'navigate',
                      'delve', 'unlock', 'harness', 'elevate', 'pivotal', 'landscape',
                      'ecosystem', 'paradigm', 'robust', 'seamless', 'transformative', 'cutting-edge',
                      'game-changing', 'forward-thinking', 'actionable', 'scalable', 'holistic', 'multifaceted',
                      'nuanced', 'intricate', 'compelling', 'impactful', 'innovative',
                    ].map(word => (
                      <li
                        key={word}
                        className="text-sm text-[var(--text-muted-70)] border-l-2 border-[var(--accent)]/20 pl-3 py-1"
                      >
                        {word}
                      </li>
                    ))}
                  </ul>
                </div>
              </FadeIn>

              {/* Cat 2: Sentence patterns */}
              <FadeIn>
                <div>
                  <span className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted-label)] block mb-3">Category 2</span>
                  <h3 className="font-['Playfair_Display'] text-2xl mb-2">Sentence patterns AI repeats</h3>
                  <p className="text-[var(--text-muted-70)] text-sm mb-6">These structures feel polished. They also feel predictable.</p>
                  <ResearchPair aiText='X is not just Y. It is Z.' humanText="X changes how people approach Y. It is not a tool. It is a different way of thinking." />
                  <ResearchPair aiText='While X matters, Y matters equally.' humanText="X helps. Y usually decides the outcome." />
                  <ResearchPair aiText='Whether you are X, Y, or Z, this applies.' humanText="X, Y, and Z all run into this problem." />
                  <ResearchPair aiText="In today's rapidly changing world..." humanText="Things move fast right now." />
                  <ResearchPair aiText='One of the biggest challenges today is...' humanText="Most teams struggle with..." />
                </div>
              </FadeIn>

              {/* Cat 3: Transitions */}
              <FadeIn>
                <div>
                  <span className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted-label)] block mb-3">Category 3</span>
                  <h3 className="font-['Playfair_Display'] text-2xl mb-2">Transitions that give it away</h3>
                  <ul className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5" role="list">
                    {['Furthermore', 'Moreover', 'Additionally', 'Nevertheless', 'Consequently', 'Thus', 'In contrast', 'As a result'].map(t => (
                      <li key={t} className="text-sm text-[var(--text-muted-70)] border-l-2 border-[var(--accent)]/20 pl-3 py-1">
                        {t}
                      </li>
                    ))}
                  </ul>
                  <p className="text-[var(--text-primary)] text-sm">Humans say: also, plus, but, still, yet, so, anyway.</p>
                </div>
              </FadeIn>

              {/* Cat 4: Email */}
              <FadeIn>
                <div>
                  <span className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted-label)] block mb-3">Category 4</span>
                  <h3 className="font-['Playfair_Display'] text-2xl mb-2">Email habits AI leans on</h3>
                  <p className="text-[var(--text-muted-70)] text-sm mb-2">Openers: &quot;I hope this finds you well.&quot; &quot;I trust you are doing well.&quot;</p>
                  <p className="text-[var(--text-muted-70)] text-sm mb-2">Closers: &quot;Please don&apos;t hesitate to reach out.&quot; &quot;Thank you for your time and consideration.&quot;</p>
                  <p className="text-[var(--text-primary)] text-sm">Real emails start with &quot;Hi [name].&quot; Real emails end with &quot;Thanks.&quot;</p>
                </div>
              </FadeIn>

              {/* Cat 5: LinkedIn */}
              <FadeIn>
                <div>
                  <span className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted-label)] block mb-3">Category 5</span>
                  <h3 className="font-['Playfair_Display'] text-2xl mb-2">LinkedIn patterns AI loves</h3>
                  <ResearchPair aiText='I learned something important today.' humanText="A client asked me something this morning that made me think." />
                  <ResearchPair aiText='Nobody talks about this. / Most people think X. They are wrong.' humanText="I don't see this discussed much. My experience has been different from what people assume." />
                  <ResearchPair aiText='Agree? / Read that again.' humanText="Curious what others think." />
                </div>
              </FadeIn>

              {/* Cat 6: YouTube */}
              <FadeIn>
                <div>
                  <span className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted-label)] block mb-3">Category 6</span>
                  <h3 className="font-['Playfair_Display'] text-2xl mb-2">YouTube script habits</h3>
                  <ResearchPair aiText='What happens next will shock you.' humanText="Here is what actually happened." />
                  <ResearchPair aiText='Make sure you watch until the end.' humanText="I will show the final result at the end." />
                  <ResearchPair aiText='Everything changed overnight.' humanText="Over a few months, things improved." />
                </div>
              </FadeIn>

              {/* Cat 7: Weak openings */}
              <FadeIn>
                <div>
                  <span className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted-label)] block mb-3">Category 7</span>
                  <h3 className="font-['Playfair_Display'] text-2xl mb-2">Weak introductions and endings</h3>
                  <p className="text-[var(--text-muted-70)] text-sm mb-2">
                    AI intros often start with: &quot;In today&apos;s fast-paced world...&quot; or &quot;AI has transformed...&quot;
                  </p>
                  <p className="text-[var(--text-muted-70)] text-sm mb-2">
                    AI conclusions just repeat what was already said. Often starting with &quot;In conclusion&quot; or &quot;To sum up.&quot;
                  </p>
                  <p className="text-[var(--text-primary)] text-sm">
                    A good ending adds something new. Or ends with a question. Or stops before overstaying.
                  </p>
                </div>
              </FadeIn>

              {/* Cat 8: Structure */}
              <FadeIn>
                <div>
                  <span className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted-label)] block mb-3">Category 8</span>
                  <h3 className="font-['Playfair_Display'] text-2xl mb-2">Structure habits</h3>
                  <p className="text-[var(--text-muted-70)] text-sm mb-2">
                    AI writes in neat blocks. Introduction. Point one and example. Point two and example.
                    Point three and example. Conclusion.
                  </p>
                  <p className="text-[var(--text-muted-70)] text-sm mb-2">
                    Every paragraph is roughly the same length. Every sentence feels measured.
                  </p>
                  <p className="text-[var(--text-primary)] text-sm">
                    Real writing is uneven. Some paragraphs are short. Some ramble. Good writing does not need to be symmetrical.
                  </p>
                </div>
              </FadeIn>

              {/* Cat 9: Conversational rewrites */}
              <FadeIn>
                <div>
                  <span className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted-label)] block mb-3">Category 9</span>
                  <h3 className="font-['Playfair_Display'] text-2xl mb-2">Conversational rewrites</h3>
                  <ResearchPair aiText="It is important to note that effective communication plays a pivotal role in fostering successful relationships." humanText="If people do not talk well, relationships fall apart." />
                  <ResearchPair aiText="By leveraging modern technologies, organizations can optimize operational efficiency." humanText="New software helps teams get more done." />
                  <ResearchPair aiText="In today's rapidly evolving landscape, adaptability is essential." humanText="Things change fast. People who adapt do better." />
                  <ResearchPair aiText="The key takeaway is that consistency drives long-term success." humanText="Small habits, repeated over time, usually beat big one-off efforts." />
                </div>
              </FadeIn>

              {/* Cat 10: What AI misses */}
              <FadeIn>
                <div>
                  <span className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted-label)] block mb-3">Category 10</span>
                  <h3 className="font-['Playfair_Display'] text-2xl mb-2">What AI rarely does</h3>
                  <p className="text-[var(--text-muted-70)] text-sm leading-relaxed">
                    Humans contradict themselves. They change tone mid-paragraph. They use strange metaphors.
                    They tell messy stories. They add irrelevant details. They leave thoughts unfinished.
                    They express uncertainty without fixing it.
                  </p>
                  <p className="text-[var(--text-primary)] text-sm leading-relaxed mt-3">
                    AI smooths all of that out. That smoothness is the biggest tell.
                  </p>
                </div>
              </FadeIn>
            </div>

            {/* Sources */}
            <FadeIn>
              <div className="mt-16 pt-8 border-t border-[var(--border-color)]">
                <h3 className="font-['Playfair_Display'] text-xl mb-4">Sources</h3>
                <ul className="space-y-2" role="list">
                  {[
                    { label: 'Wikipedia: AI-generated Content on Wikipedia', url: 'https://en.wikipedia.org/wiki/AI-generated_content_on_Wikipedia' },
                    { label: 'What Distinguishes AI-Generated from Human Writing? A Rapid Review (2026)', url: 'https://www.mdpi.com/2504-2289/10/2/55' },
                    { label: 'Linguistic Characteristics of AI-Generated Text: A Survey', url: 'https://arxiv.org/abs/2510.05136' },
                    { label: 'AI Writing Fingerprints: Identify and Fix AI-Generated Content', url: 'https://www.searchenginejournal.com/ai-writing-fingerprints-how-to-spot-fix-ai-generated-content/541613/' },
                    { label: 'The Subtle Signs That Give Away Chatbot Writing', url: 'https://www.techspot.com/news/109186-subtle-signs-give-away-chatbot-writing-according-wikipedia.html' },
                    { label: 'Human Heuristics for AI-Generated Language Are Flawed', url: 'https://arxiv.org/abs/2206.07271' },
                  ].map(src => (
                    <li key={src.url}>
                      <a
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-[var(--text-muted-70)] border-b border-[var(--text-muted-30)] pb-0.5 hover:text-[var(--accent)] hover:border-[var(--accent)] transition-colors"
                      >
                        {src.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </FadeIn>
          </div>
        </section>

        {/* PRICING */}
        <section id="pricing" className="py-24 border-b border-[var(--border-color)]">
          <div className="max-w-7xl mx-auto px-6">
            <FadeIn>
              <span className="text-xs uppercase tracking-[0.2em] text-[var(--accent)] font-semibold block mb-4">
                Pricing
              </span>
            </FadeIn>
            <FadeIn delay={100}>
              <h2 className="font-['Playfair_Display'] text-3xl sm:text-4xl mb-3">Simple. Two plans.</h2>
            </FadeIn>
            <FadeIn delay={200}>
              <p className="text-[var(--text-muted-70)] max-w-md text-base leading-relaxed mb-10">
                No hidden fees. No surprise charges.
              </p>
            </FadeIn>

            {/* Toggle */}
            <FadeIn delay={250}>
              <div className="flex items-center justify-center gap-4 mb-12" role="group" aria-label="Billing period">
                <span className={`text-sm ${!yearly ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted-50)]'}`}>
                  Monthly
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={yearly}
                  aria-label="Toggle yearly billing"
                  onClick={() => setYearly(v => !v)}
                  className={`relative w-12 h-7 rounded-full transition-colors ${yearly ? 'bg-[var(--accent)]' : 'bg-[var(--surface-hover)]'} border border-[var(--border-color)]`}
                >
                  <span
                    className={`absolute top-[2px] left-[2px] w-5 h-5 rounded-full bg-[var(--accent)] transition-all ${yearly ? 'left-[22px]' : 'left-[2px]'}`}
                    aria-hidden="true"
                  />
                </button>
                <span className={`text-sm ${yearly ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted-50)]'}`}>
                  Yearly
                </span>
              </div>
            </FadeIn>

            <FadeIn delay={300}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1 max-w-4xl mx-auto">
                {/* Starter */}
                <div className="p-8 lg:p-10 border border-[var(--border-color)] rounded-lg">
                  <h3 className="font-['Playfair_Display'] text-2xl mb-2">Starter</h3>
                  <div className="mb-1">
                    <span className="font-['Playfair_Display'] text-5xl text-[var(--accent)]">
                      ${yearly ? '92' : '9'}
                    </span>
                  </div>
                  <p className="text-sm text-[var(--text-muted-50)] mb-6">{yearly ? '/year' : '/month'}</p>
                  <p className="text-sm text-[var(--text-muted-70)] mb-8 leading-relaxed">
                    For individual writers who want cleaner copy.
                  </p>
                  <ul className="space-y-3 mb-10" role="list">
                    {['Up to 50 scans per month', 'Real-time pattern detection', 'Rewrite suggestions', 'Email support'].map(f => (
                      <li key={f} className="text-sm text-[var(--text-muted-70)] border-b border-[var(--border-color)] pb-3">
                        <span className="text-[var(--accent)] mr-2" aria-hidden="true">—</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Button
                    onClick={() => scrollTo('#canvas')}
                    variant="outline"
                    className="w-full text-sm uppercase tracking-[0.08em] font-semibold py-3 border-[var(--text-muted-30)] text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] bg-transparent"
                  >
                    Get Started
                  </Button>
                </div>

                {/* Professional */}
                <div className="p-8 lg:p-10 border border-[var(--accent)] rounded-lg relative">
                  <Badge className="absolute -top-3 left-10 bg-[var(--accent)] text-white text-[10px] uppercase tracking-[0.15em] font-semibold px-4 py-1">
                    Most Popular
                  </Badge>
                  <h3 className="font-['Playfair_Display'] text-2xl mb-2">Professional</h3>
                  <div className="mb-1">
                    <span className="font-['Playfair_Display'] text-5xl text-[var(--accent)]">
                      ${yearly ? '236' : '23'}
                    </span>
                  </div>
                  <p className="text-sm text-[var(--text-muted-50)] mb-6">{yearly ? '/year' : '/month'}</p>
                  <p className="text-sm text-[var(--text-muted-70)] mb-8 leading-relaxed">
                    For teams and editors who review a lot of content.
                  </p>
                  <ul className="space-y-3 mb-10" role="list">
                    {['Unlimited scans', 'Batch analysis', 'Custom pattern library', 'Priority support', 'Team dashboard'].map(f => (
                      <li key={f} className="text-sm text-[var(--text-muted-70)] border-b border-[var(--border-color)] pb-3">
                        <span className="text-[var(--accent)] mr-2" aria-hidden="true">—</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Button
                    onClick={() => scrollTo('#canvas')}
                    className="w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm uppercase tracking-[0.08em] font-semibold py-3"
                  >
                    Get Started
                  </Button>
                </div>
              </div>
            </FadeIn>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="py-24 border-b border-[var(--border-color)]">
          <div className="max-w-7xl mx-auto px-6">
            <FadeIn>
              <span className="text-xs uppercase tracking-[0.2em] text-[var(--accent)] font-semibold block mb-4">
                FAQ
              </span>
            </FadeIn>
            <FadeIn delay={100}>
              <h2 className="font-['Playfair_Display'] text-3xl sm:text-4xl mb-12">Common questions.</h2>
            </FadeIn>
            <FadeIn delay={200}>
              <div className="max-w-2xl mx-auto">
                <Accordion type="single" collapsible className="w-full">
                  {[
                    { q: 'Does JK-TECH-CODE store my writing?', a: 'No. Your text is analyzed in memory and never written to disk. Once you close the browser tab, it is gone.' },
                    { q: 'Can JK-TECH-CODE detect ChatGPT, Gemini, and Claude?', a: 'JK-TECH-CODE does not try to identify which model wrote something. It looks for patterns common across all AI-generated text. That approach works regardless of the model.' },
                    { q: 'Can I just use JK-TECH-CODE to rewrite my AI drafts?', a: 'Yes. That is exactly what it is for. Paste AI-generated text. JK-TECH-CODE flags what sounds robotic. You rewrite those parts. The result sounds like you again.' },
                    { q: 'Is this a plagiarism checker?', a: 'No. JK-TECH-CODE does not check for copied content. It checks for writing patterns that feel machine-generated. Two different things.' },
                    { q: 'Does it work for non-English text?', a: 'Currently JK-TECH-CODE is built for English. Support for other languages is under development.' },
                  ].map((faq, i) => (
                    <AccordionItem key={i} value={`faq-${i}`} className="border-b border-[var(--border-color)]">
                      <AccordionTrigger className="text-base text-left hover:no-underline py-5 text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors">
                        {faq.q}
                      </AccordionTrigger>
                      <AccordionContent className="text-sm text-[var(--text-muted-70)] leading-relaxed pb-5">
                        {faq.a}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            </FadeIn>
          </div>
        </section>

        {/* FINAL CTA */}
        <section id="cta" className="py-32 text-center">
          <div className="max-w-7xl mx-auto px-6">
            <FadeIn>
              <h2 className="font-['Playfair_Display'] text-3xl sm:text-4xl mb-4">
                Your writing should sound like you.
              </h2>
            </FadeIn>
            <FadeIn delay={100}>
              <p className="text-[var(--text-muted-70)] max-w-lg mx-auto text-base leading-relaxed mb-10">
                Not like a language model. Not like a corporate template. JK-TECH-CODE helps you sound human again.
              </p>
            </FadeIn>
            <FadeIn delay={200}>
              <Button
                onClick={() => scrollTo('#canvas')}
                className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold text-sm uppercase tracking-[0.1em] px-14 py-4 h-auto"
                size="lg"
              >
                <Sparkles className="mr-2 h-4 w-4" />
                Try JK-TECH-CODE Free
              </Button>
            </FadeIn>
          </div>
        </section>
      </main>

      {/* ─── FOOTER ─── */}
      <footer className="border-t border-[var(--border-color)] py-8 mt-auto">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <p className="text-xs text-[var(--text-muted-30)] mb-3">
            JK-TECH-CODE — AI writing detection and humanization tool
          </p>
          <div className="flex justify-center gap-6 mb-4">
            <Link href="/privacy" className="text-xs text-[var(--text-muted-30)] hover:text-[var(--accent)] transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="text-xs text-[var(--text-muted-30)] hover:text-[var(--accent)] transition-colors">Terms of Service</Link>
            <Link href="/contact" className="text-xs text-[var(--text-muted-30)] hover:text-[var(--accent)] transition-colors">Contact</Link>
            <Link href="/pricing" className="text-xs text-[var(--text-muted-30)] hover:text-[var(--accent)] transition-colors">Pricing</Link>
          </div>
          <p className="text-xs text-[var(--text-muted-30)]">
            &copy; 2026 JK-TECH-CODE. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}