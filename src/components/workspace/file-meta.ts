import {
  File,
  FileArchive,
  FileAudio,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { FileKind } from './types';

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif', 'heic', 'tiff']);
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'mkv', 'avi']);
const ARCHIVE_EXTENSIONS = new Set(['zip', 'rar', '7z', 'tar', 'gz']);
const CODE_EXTENSIONS = new Set(['js', 'ts', 'tsx', 'jsx', 'py', 'java', 'go', 'rs', 'c', 'cpp', 'css', 'html', 'json', 'sql', 'sh', 'yaml', 'yml']);
const SHEET_EXTENSIONS = new Set(['xlsx', 'xls', 'csv', 'numbers']);
const DOC_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'txt', 'md', 'rtf', 'odt', 'ppt', 'pptx', 'key']);

/** Lower-cased file extension without the dot. */
export function fileExtension(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() || '';
}

/** Classifies a file by extension + MIME type so the UI can show the right icon. */
export function detectKind(fileName: string, mime: string): FileKind {
  const ext = fileExtension(fileName);
  if (mime.startsWith('image/') || IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (mime.startsWith('audio/') || AUDIO_EXTENSIONS.has(ext)) return 'audio';
  if (mime.startsWith('video/') || VIDEO_EXTENSIONS.has(ext)) return 'video';
  if (ARCHIVE_EXTENSIONS.has(ext)) return 'archive';
  if (CODE_EXTENSIONS.has(ext)) return 'code';
  if (SHEET_EXTENSIONS.has(ext)) return 'sheet';
  if (DOC_EXTENSIONS.has(ext)) return 'doc';
  return 'file';
}

export function fileKindMeta(fileName: string, mime: string): {
  Icon: LucideIcon;
  color: string;
  label: string;
} {
  switch (detectKind(fileName, mime)) {
    case 'image':
      return { Icon: FileImage, color: 'text-violet-500', label: 'Image' };
    case 'audio':
      return { Icon: FileAudio, color: 'text-pink-500', label: 'Audio' };
    case 'video':
      return { Icon: FileVideo, color: 'text-orange-500', label: 'Video' };
    case 'archive':
      return { Icon: FileArchive, color: 'text-amber-500', label: 'Archive' };
    case 'code':
      return { Icon: FileCode2, color: 'text-emerald-500', label: 'Code' };
    case 'sheet':
      return { Icon: FileSpreadsheet, color: 'text-green-500', label: 'Spreadsheet' };
    case 'doc':
      return { Icon: FileText, color: 'text-blue-500', label: 'Document' };
    default:
      return { Icon: File, color: 'text-[var(--text-muted-50)]', label: 'File' };
  }
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}
