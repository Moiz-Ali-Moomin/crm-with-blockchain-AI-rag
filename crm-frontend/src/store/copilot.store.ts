import { create } from 'zustand';
import axios from 'axios';
import { apiPost } from '@/lib/api/client';

export interface CopilotSource {
  id: string;
  entityType: string;
  snippet: string;
  score: number;
}

export interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: CopilotSource[];
  timestamp: number;
}

export interface CopilotContext {
  page?: string;
  entityId?: string;
}

interface CopilotState {
  messages: CopilotMessage[];
  isLoading: boolean;
  sessionId: string;
  context: CopilotContext;
  setContext: (ctx: CopilotContext) => void;
  sendMessage: (query: string) => Promise<void>;
  clearMessages: () => void;
  cancelRequest: () => void;
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

const GREETING: CopilotMessage = {
  id: 'init',
  role: 'assistant',
  content:
    "Hi! I'm your AI Copilot. Ask me anything — analyze deals, find contacts, create follow-up tasks, or query your CRM data in plain English.",
  timestamp: 0,
};

// ── Module-level singletons ────────────────────────────────────────────────────
// Stored outside Zustand so they are immune to state batching and re-renders.
// _controller: the AbortController for the currently-in-flight Axios request.
// _activeReqId: a unique ID tagging the request that "owns" the loading state.
//
// Invariant: exactly one of {null, active} at any time.
// A new sendMessage() always aborts the previous controller before taking over.
let _controller: AbortController | null = null;
let _activeReqId: string | null = null;

// ── Cross-tab coordination via BroadcastChannel ────────────────────────────────
// When the user has multiple tabs open, a new sendMessage in any tab cancels
// the in-flight request in all other tabs. This prevents parallel AI requests
// from the same user session, which would waste backend compute and could
// trigger per-user rate limits.
//
// BroadcastChannel is same-origin only — no cross-site leakage. Guard for SSR
// environments where BroadcastChannel is unavailable.
const _channel: BroadcastChannel | null =
  typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('copilot:ai-request') : null;

if (_channel) {
  _channel.onmessage = (e: MessageEvent) => {
    if (e.data?.type !== 'TAKEOVER') return;
    // Another tab has started a request — cancel ours if we have one.
    if (_controller) {
      _controller.abort();
      _controller = null;
    }
    _activeReqId = null;
    // Direct setState reference (resolved after store creation below).
    useCopilotStore.setState({ isLoading: false });
  };
}

export const useCopilotStore = create<CopilotState>((set, get) => ({
  messages: [GREETING],
  isLoading: false,
  sessionId: makeId(),
  context: {},

  setContext: (ctx) => set({ context: ctx }),

  clearMessages: () =>
    set({ messages: [{ ...GREETING, timestamp: Date.now() }], sessionId: makeId() }),

  // Cancel the in-flight request and reset loading state.
  // Call this from component cleanup (useEffect return) to prevent a stuck
  // loading spinner when the user navigates away mid-request.
  cancelRequest: () => {
    if (_controller) {
      _controller.abort();
      _controller = null;
    }
    _activeReqId = null;
    set({ isLoading: false });
  },

  sendMessage: async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;

    console.count('sendMessage called'); // defensive: must fire exactly once per user action

    // ── Step 1: Cancel any previous in-flight request ─────────────────────────
    // This is the hard guarantee: at most one HTTP request exists at any time.
    // The aborted request's catch block will see signal.aborted === true and
    // exit silently — it will NOT clobber our new loading state.
    //
    // Also broadcast TAKEOVER to cancel any in-flight request in other browser
    // tabs. The local abort below handles this tab; the channel handles the rest.
    _channel?.postMessage({ type: 'TAKEOVER' });
    if (_controller) {
      _controller.abort();
    }

    // ── Step 2: Claim exclusive ownership of this request slot ────────────────
    // reqId lets us detect stale completions: if _activeReqId !== reqId when
    // we try to update state, another request has superseded us — bail out.
    const reqId = makeId();
    const controller = new AbortController();
    _controller = controller;
    _activeReqId = reqId;

    const userMsg: CopilotMessage = {
      id: makeId(),
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
    };

    // isLoading: true signals the UI to disable input immediately. This set is
    // synchronous so the next render cycle will already show the blocked state.
    set((s) => ({ messages: [...s.messages, userMsg], isLoading: true }));

    try {
      const { sessionId, context } = get();

      // Raw shape the backend actually returns (RagSource field names)
      type RawSource = {
        entityType: string;
        entityId: string;
        similarity: number;
        excerpt: string;
      };

      const res = await apiPost<{ answer: string; sources?: RawSource[] }>(
        '/ai/copilot',
        { query: trimmed, context, sessionId },
        {
          // AI responses can take 20-60 s — override the 30 s global default.
          timeout: 120_000,
          // Passes our AbortController signal into Axios. If this request is
          // superseded (new sendMessage) or cancelled (unmount), Axios will
          // throw CanceledError and the catch below exits silently.
          signal: controller.signal,
        },
      );

      // ── Stale response guard ───────────────────────────────────────────────
      // If _activeReqId changed while we were awaiting (a new sendMessage raced
      // in, which is theoretically impossible with the abort above but guarded
      // defensively), discard this result entirely.
      if (_activeReqId !== reqId) return;

      const sources: CopilotSource[] = (res.sources ?? []).map((s) => ({
        id:         s.entityId,
        entityType: s.entityType,
        snippet:    s.excerpt,
        score:      s.similarity,
      }));

      const assistantMsg: CopilotMessage = {
        id: makeId(),
        role: 'assistant',
        content: res.answer,
        sources,
        timestamp: Date.now(),
      };

      set((s) => ({ messages: [...s.messages, assistantMsg], isLoading: false }));
    } catch (err) {
      // ── Silent cancellation ────────────────────────────────────────────────
      // axios.isCancel covers ERR_CANCELED (AbortController) and legacy
      // CancelToken. controller.signal.aborted is a secondary safety net.
      // In both cases this request was superseded intentionally — do not show
      // an error and do not reset isLoading (the new request owns it).
      if (axios.isCancel(err) || controller.signal.aborted) return;

      // ── Ownership check ────────────────────────────────────────────────────
      if (_activeReqId !== reqId) return;

      console.error('[CopilotStore] sendMessage failed:', err);

      let content = 'Sorry, something went wrong. Please try again.';

      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const responseData = err.response?.data;
        const isTimeout = err.code === 'ECONNABORTED' || err.message?.includes('timeout');

        if (isTimeout) {
          content =
            'The AI is taking longer than expected. Please wait a moment and try again — avoid resending while a response is in progress.';
        } else if (responseData?.message && typeof responseData.message === 'string') {
          // Priority: Use the descriptive error message from the backend envelope
          content = responseData.message;
        } else if (status === 429) {
          const retryAfter = err.response?.headers?.['retry-after'];
          const waitSecs = retryAfter ? parseInt(retryAfter, 10) : 60;
          content = `You've sent too many messages. Please wait ${waitSecs} second${waitSecs !== 1 ? 's' : ''} before trying again.`;
        } else if (status === 401) {
          content = 'Your session has expired. Please refresh the page and log in again.';
        } else if (status === 403) {
          content = "You don't have permission to use the AI Copilot.";
        } else if (status === 503) {
          content = 'The AI service is currently busy. Please wait a moment and try again.';
        } else if (status && status >= 500) {
          content = 'The AI service is temporarily unavailable. Please try again in a moment.';
        }
      }

      const errorMsg: CopilotMessage = {
        id: makeId(),
        role: 'assistant',
        content,
        timestamp: Date.now(),
      };
      set((s) => ({ messages: [...s.messages, errorMsg], isLoading: false }));
    } finally {
      // Release the slot only if we still own it. If another request has taken
      // over (_activeReqId !== reqId), leave the slot to its new owner.
      if (_activeReqId === reqId) {
        _controller = null;
        _activeReqId = null;
      }
    }
  },
}));
