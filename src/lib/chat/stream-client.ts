/**
 * Robust Server-Sent Events (SSE) client shared by every chat UI.
 *
 * Fixes the three root causes of "blank assistant messages":
 *  1. Events split across network chunks are buffered and reassembled.
 *  2. `data: {error}` events are surfaced to the caller instead of ignored.
 *  3. A stream that ends without content raises a descriptive error so the UI
 *     can render a friendly error card instead of an empty bubble.
 */

export interface StreamEvent {
  content?: string;
  done?: boolean;
  error?: string;
  status?: 'thinking' | 'generating';
  retryable?: boolean;
  modelUsed?: string;
  [key: string]: unknown;
}

export interface StreamCallbacks {
  /** Called once per content delta so the UI can stream tokens live. */
  onContent: (delta: string) => void;
  /** Called when the server reports an error mid-stream (non-fatal to the connection). */
  onError?: (message: string) => void;
  /** Called when the model enters a phase (thinking / generating). */
  onStatus?: (status: 'thinking' | 'generating') => void;
  /** Called when the `done` event arrives. */
  onDone?: (info: { modelUsed?: string; content: string }) => void;
}

export interface StreamResult {
  content: string;
  modelUsed?: string;
}

/** Thrown when the server reports an error event or the stream ends empty. */
export class StreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StreamError';
  }
}

function processPayload(
  payload: string,
  state: { fullContent: string; streamError: string | null; modelUsed?: string },
  callbacks: StreamCallbacks,
): boolean {
  let data: StreamEvent;
  try {
    data = JSON.parse(payload) as StreamEvent;
  } catch {
    return false; // ignore malformed lines
  }

  if (data.error) {
    const message = String(data.error);
    state.streamError = message;
    callbacks.onError?.(message);
  }
  if (data.status) {
    callbacks.onStatus?.(data.status);
  }
  if (data.content) {
    state.fullContent += data.content;
    callbacks.onContent(data.content);
  }
  if (data.modelUsed) {
    state.modelUsed = data.modelUsed;
  }
  if (data.done) {
    callbacks.onDone?.({ modelUsed: state.modelUsed, content: state.fullContent });
    return true;
  }
  return false;
}

/**
 * Reads an SSE response body to completion.
 *
 * @throws {StreamError} when the server reports an error event or the stream
 *   finishes without producing any content — the caller should render an
 *   error card and offer Retry.
 * @throws {Error} on network / parsing failures.
 */
export async function readStream(
  res: Response,
  callbacks: StreamCallbacks,
): Promise<StreamResult> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error('Response body is not a readable stream.');

  const decoder = new TextDecoder();
  const state: { fullContent: string; streamError: string | null; modelUsed?: string } = {
    fullContent: '',
    streamError: null,
  };

  let buffer = '';
  let finished = false;

  const processBuffer = (): boolean => {
    // Split into complete events ("\n\n" is the SSE terminator).
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';
    for (const part of parts) {
      for (const rawLine of part.split('\n')) {
        const line = rawLine.trim();
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        if (processPayload(payload, state, callbacks)) {
          finished = true;
          return true;
        }
      }
    }
    return false;
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    if (processBuffer()) break;
  }

  // Flush anything left in the buffer after the stream closed.
  if (!finished) {
    buffer += decoder.decode();
    processBuffer();
  }

  if (state.streamError) {
    throw new StreamError(state.streamError);
  }
  // A response that is only whitespace (spaces, newlines, tabs) is effectively
  // blank — surface it as an error so the UI renders an error card + Retry
  // instead of an empty-looking assistant bubble.
  if (!state.fullContent || !state.fullContent.trim()) {
    throw new StreamError('The assistant returned an empty response. Please try again.');
  }
  return { content: state.fullContent, modelUsed: state.modelUsed };
}
