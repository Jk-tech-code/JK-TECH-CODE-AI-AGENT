export type AttachmentStatus = 'ready' | 'uploading' | 'done' | 'error';

export type FileKind = 'image' | 'audio' | 'video' | 'archive' | 'code' | 'sheet' | 'doc' | 'file';

export interface AttachmentItem {
  id: string;
  name: string;
  size: number;
  /** MIME type of the file */
  type: string;
  kind: FileKind;
  /** Original File while pending in the composer (not persisted). */
  file?: File;
  /** Object URL for image previews (client-side only) */
  previewUrl?: string;
  status: AttachmentStatus;
  /** 0-100 upload progress */
  progress?: number;
  /** Document id returned by /api/upload once uploaded */
  docId?: string;
  error?: string;
}

export interface WorkspaceMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  streaming?: boolean;
  /** Phase shown while streaming with no content yet: 'thinking' | 'generating' */
  streamingStatus?: 'thinking' | 'generating';
  /** True when the assistant reply failed — renders an error card instead of blank text */
  error?: boolean;
  errorText?: string;
  reaction?: 'up' | 'down' | null;
  attachments?: AttachmentItem[];
}
