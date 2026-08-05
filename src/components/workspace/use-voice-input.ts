'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLatest } from '@reactuses/core';

// The global `window.SpeechRecognition` / `window.webkitSpeechRecognition`
// declarations are provided by @reactuses/core — the same package that
// supplies `useLatest` below. Its SpeechRecognition interfaces are
// module-scoped, so we derive the recognizer instance type from the global
// Window property rather than redeclaring it (which would collide).
// The hook contract is deliberately small so a server-side Whisper
// transcription can replace this client-side recognizer later without
// touching the consuming component.
type SpeechRecognitionInstance = InstanceType<NonNullable<Window['SpeechRecognition']>>;

export interface UseVoiceInputOptions {
  /** Called with each final transcript segment as it becomes available. */
  onTranscript: (text: string) => void;
  /** BCP-47 language tag passed to the recognizer (default: en-US). */
  lang?: string;
}

export interface UseVoiceInputResult {
  /** True when this browser exposes the Speech Recognition API. */
  supported: boolean;
  listening: boolean;
  /** Live partial transcript while speaking (shown as a preview). */
  interim: string;
  /** Human-readable error for the last failure (permission, no mic, …). */
  error: string | null;
  start: () => void;
  stop: () => void;
}

function mapRecognitionError(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone access was denied. Allow it in your browser settings to use voice input.';
    case 'no-speech':
      return 'No speech detected — try again.';
    case 'audio-capture':
      return 'No microphone found. Check your device, or attach an audio file instead.';
    case 'network':
      return 'Speech recognition failed due to a network error.';
    case 'language-not-supported':
      return "This language isn't supported by the speech recognizer.";
    default:
      return `Voice input failed (${code}).`;
  }
}

export function useVoiceInput({
  onTranscript,
  lang = 'en-US',
}: UseVoiceInputOptions): UseVoiceInputResult {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  // True once at least one final transcript was committed this session — lets us
  // treat a silent auto-end ('no-speech') as a normal wrap-up instead of an error.
  const heardRef = useRef(false);

  // Keep the latest transcript handler without re-creating the recognizer.
  const onTranscriptRef = useLatest(onTranscript);

  const supported = typeof window !== 'undefined'
    && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  // Escape stops listening without fighting the workspace's
  // Escape-stops-streaming shortcut (that one only fires while loading).
  useEffect(() => {
    if (!listening) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') recognitionRef.current?.stop();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [listening]);

  // Never leave a recognizer running if the composer unmounts mid-session.
  useEffect(() => () => recognitionRef.current?.abort(), []);

  const start = useCallback(() => {
    // Guard the recognizer, not just `listening`: that state flips true
    // asynchronously in onstart, so a rapid double-click could otherwise start
    // a second session on top of one that's already starting.
    if (listening || recognitionRef.current) return;
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) return;

    try {
      const rec = new Ctor();
      rec.lang = lang;
      // One utterance per session — recognition auto-ends after a pause, which
      // is exactly the "done speaking" signal we want.
      rec.continuous = false;
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      rec.onstart = () => {
        heardRef.current = false;
        setInterim('');
        setError(null);
        setListening(true);
      };

      rec.onresult = (event) => {
        let finalText = '';
        let interimText = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const transcript = result[0]?.transcript ?? '';
          if (result.isFinal) finalText += transcript;
          else interimText += transcript;
        }
        if (finalText.trim()) {
          heardRef.current = true;
          onTranscriptRef.current(finalText.trim());
        }
        setInterim(interimText.trim());
      };

      rec.onerror = (event) => {
        // 'aborted' is expected when the user stops/cancels — stay silent.
        // 'no-speech' after something was already captured just means the
        // session wrapped up normally — also silent.
        if (event.error === 'aborted') return;
        if (event.error === 'no-speech' && heardRef.current) return;
        setError(mapRecognitionError(event.error));
        setInterim('');
        setListening(false);
        recognitionRef.current = null;
      };

      rec.onend = () => {
        recognitionRef.current = null;
        setInterim('');
        setListening(false);
      };

      recognitionRef.current = rec;
      rec.start();
    } catch {
      // Some browsers expose the constructor but still fail to start.
      recognitionRef.current = null;
      setInterim('');
      setListening(false);
      setError('Voice input could not be started in this browser.');
    }
  }, [listening, lang]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setInterim('');
    setListening(false);
  }, []);

  return { supported, listening, interim, error, start, stop };
}
