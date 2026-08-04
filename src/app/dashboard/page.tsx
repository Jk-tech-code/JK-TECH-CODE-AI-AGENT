'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  MessageSquare, FileText, Trash2, Plus, Upload, Download,
  ChevronRight, Clock, Bot, User, Loader2, Search, X,
  File, FileSpreadsheet, FileImage, FileText as FileIcon,
  LogOut,
} from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';

interface Conversation {
  id: string;
  title: string;
  messageCount: number;
  lastMessage: string;
  createdAt: string;
  updatedAt: string;
}

interface Message {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}

interface ConversationDetail {
  id: string;
  title: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

interface DocumentItem {
  id: string;
  title: string;
  fileType: string;
  fileSize: number;
  sourceType: string;
  createdAt: string;
  chunks: number;
}

type Tab = 'conversations' | 'documents';

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 86400000) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diff < 604800000) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function fileIcon(type: string) {
  if (type.startsWith('image')) return <FileImage className="h-4 w-4" />;
  if (type.includes('spreadsheet') || type.includes('csv')) return <FileSpreadsheet className="h-4 w-4" />;
  if (type.includes('pdf')) return <FileText className="h-4 w-4" />;
  return <File className="h-4 w-4" />;
}

export default function DashboardPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('conversations');
  const [authChecked, setAuthChecked] = useState(false);

  // Conversations
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<ConversationDetail | null>(null);
  const [convLoading, setConvLoading] = useState(true);

  // Documents
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [docLoading, setDocLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [docDetail, setDocDetail] = useState<{ id: string; title: string; content: string; createdAt: string } | null>(null);
  const [docDetailLoading, setDocDetailLoading] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
      } else {
        setAuthChecked(true);
      }
    };
    checkAuth();
  }, [router]);

  const fetchConversations = useCallback(async () => {
    setConvLoading(true);
    try {
      const res = await fetch('/api/conversations');
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations);
      }
    } catch { console.warn('[dashboard] fetch conversations failed'); } finally {
      setConvLoading(false);
    }
  }, []);

  const fetchDocuments = useCallback(async () => {
    setDocLoading(true);
    try {
      const res = await fetch('/api/upload');
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents);
      }
    } catch { console.warn('[dashboard] fetch documents failed'); } finally {
      setDocLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authChecked) return;
    const id = window.setTimeout(() => {
      fetchConversations();
      fetchDocuments();
    }, 0);
    return () => window.clearTimeout(id);
  }, [authChecked, fetchConversations, fetchDocuments]);

  // Conversations
  const openConversation = useCallback(async (id: string) => {
    setSelectedConv(null);
    try {
      const res = await fetch(`/api/conversations/${id}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedConv(data);
        setTab('conversations');
      }
    } catch {
      toast.error('Failed to load conversation.');
    }
  }, []);

  const deleteConversation = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/conversations?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setConversations(prev => prev.filter(c => c.id !== id));
        if (selectedConv?.id === id) setSelectedConv(null);
        toast.success('Conversation deleted.');
      }
    } catch {
      toast.error('Failed to delete.');
    }
  }, [selectedConv]);

  const newConversation = useCallback(() => {
    router.push('/#agent');
  }, [router]);

  // Documents
  const uploadFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (res.ok) {
        toast.success('File uploaded.');
        fetchDocuments();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Upload failed.');
      }
    } catch {
      toast.error('Upload failed.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [fetchDocuments]);

  const deleteDocument = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/document?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setDocuments(prev => prev.filter(d => d.id !== id));
        if (docDetail?.id === id) setDocDetail(null);
        toast.success('Document deleted.');
      }
    } catch {
      toast.error('Failed to delete.');
    }
  }, [docDetail]);

  const openDocument = useCallback(async (id: string) => {
    setDocDetail(null);
    setDocDetailLoading(true);
    try {
      const res = await fetch(`/api/upload?id=${id}`);
      if (res.ok) {
        const data = await res.json();
        setDocDetail(data);
      }
    } catch {
      toast.error('Failed to load document.');
    } finally {
      setDocDetailLoading(false);
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  }, [router]);

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
        <Loader2 className="h-6 w-6 text-[var(--accent)] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] flex flex-col">
      {/* Header */}
      <header className="h-14 border-b border-[var(--border-color)] flex items-center px-4 bg-[var(--surface)]/80 backdrop-blur-sm sticky top-0 z-30">
        <Link href="/" className="font-['Playfair_Display'] font-bold text-base text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors mr-8">
          JK-TECH-CODE<span className="text-[var(--accent)]">.</span>
        </Link>
        <div className="flex items-center gap-1 bg-[var(--background)] rounded-xl p-1 border border-[var(--border-color)]">
          <button type="button" onClick={() => setTab('conversations')}
            className={`px-3 py-1.5 text-xs rounded-lg transition-all duration-200 cursor-pointer ${
              tab === 'conversations'
                ? 'bg-[var(--accent)] text-white shadow-soft'
                : 'text-[var(--text-muted-70)] hover:text-[var(--text-primary)] bg-transparent border-none'
            }`}>
            <MessageSquare className="h-3.5 w-3.5 inline mr-1.5" />
            Conversations
          </button>
          <button type="button" onClick={() => setTab('documents')}
            className={`px-3 py-1.5 text-xs rounded-lg transition-all duration-200 cursor-pointer ${
              tab === 'documents'
                ? 'bg-[var(--accent)] text-white shadow-soft'
                : 'text-[var(--text-muted-70)] hover:text-[var(--text-primary)] bg-transparent border-none'
            }`}>
            <FileText className="h-3.5 w-3.5 inline mr-1.5" />
            Documents
          </button>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <Link href="/" className="text-xs text-[var(--text-muted-50)] hover:text-[var(--accent)] transition-colors">
            Home
          </Link>
          <button type="button" onClick={handleSignOut}
            className="text-xs text-[var(--text-muted-50)] hover:text-red-400 transition-colors flex items-center gap-1 bg-transparent border-none cursor-pointer">
            <LogOut className="h-3 w-3" />
            Sign Out
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className="w-72 lg:w-80 border-r border-[var(--border-color)] bg-[var(--surface)] flex flex-col overflow-hidden">
          <div className="p-3 border-b border-[var(--border-color)]">
            {tab === 'conversations' ? (
              <Button onClick={newConversation} size="sm"
                className="w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold rounded-xl">
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                New Conversation
              </Button>
            ) : (
              <div>
                <input ref={fileInputRef} type="file" onChange={uploadFile} className="hidden" accept=".txt,.csv,.json,.pdf,.doc,.docx,.xlsx,.pptx,.png,.jpg,.jpeg,.webp,.svg" />
                <Button onClick={() => fileInputRef.current?.click()} disabled={uploading} size="sm"
                  className="w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold rounded-xl">
                  {uploading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
                  {uploading ? 'Uploading...' : 'Upload Document'}
                </Button>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {tab === 'conversations' ? (
              convLoading ? (
                <div className="p-3 space-y-2" aria-label="Loading conversations">
                  {[0, 1, 2, 3, 4].map(i => (
                    <div key={i} className="skeleton-shimmer h-14 rounded-xl" />
                  ))}
                </div>
              ) : conversations.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <MessageSquare className="h-8 w-8 text-[var(--text-muted-30)] mx-auto mb-3" />
                  <p className="text-sm text-[var(--text-muted-50)]">No conversations yet.</p>
                  <p className="text-xs text-[var(--text-muted-30)] mt-1">Start one from the AI Agent section.</p>
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  {conversations.map(conv => (
                    <button key={conv.id} type="button" onClick={() => openConversation(conv.id)}
                      className={`group w-full text-left px-3 py-2.5 rounded-xl hover:bg-[var(--surface-hover)] transition-all duration-200 cursor-pointer border ${
                        selectedConv?.id === conv.id
                          ? 'bg-[var(--surface-hover)] border-[var(--accent)]/30'
                          : 'bg-transparent border-transparent'
                      }`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-[var(--text-primary)] font-medium truncate">{conv.title}</p>
                          {conv.lastMessage && (
                            <p className="text-xs text-[var(--text-muted-50)] truncate mt-0.5">{conv.lastMessage}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-[10px] text-[var(--text-muted-30)]">{formatDate(conv.updatedAt)}</span>
                          <button type="button" onClick={(e) => deleteConversation(conv.id, e)}
                            className="text-[var(--text-muted-30)] hover:text-red-400 transition-colors bg-transparent border-none cursor-pointer p-0 opacity-0 group-hover:opacity-100"
                            aria-label="Delete conversation">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )
            ) : (
              docLoading ? (
                <div className="p-3 space-y-2" aria-label="Loading documents">
                  {[0, 1, 2, 3, 4].map(i => (
                    <div key={i} className="skeleton-shimmer h-14 rounded-xl" />
                  ))}
                </div>
              ) : documents.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <FileText className="h-8 w-8 text-[var(--text-muted-30)] mx-auto mb-3" />
                  <p className="text-sm text-[var(--text-muted-50)]">No documents uploaded.</p>
                  <p className="text-xs text-[var(--text-muted-30)] mt-1">Upload a file to get started.</p>
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  {documents.map(doc => (
                    <button key={doc.id} type="button" onClick={() => openDocument(doc.id)}
                      className={`group w-full text-left px-3 py-2.5 rounded-xl hover:bg-[var(--surface-hover)] transition-all duration-200 cursor-pointer border ${
                        docDetail?.id === doc.id
                          ? 'bg-[var(--surface-hover)] border-[var(--accent)]/30'
                          : 'bg-transparent border-transparent'
                      }`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span className="text-[var(--accent)] flex-shrink-0">{fileIcon(doc.fileType)}</span>
                          <div className="min-w-0">
                            <p className="text-sm text-[var(--text-primary)] font-medium truncate">{doc.title}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] text-[var(--text-muted-50)]">{formatSize(doc.fileSize)}</span>
                              <span className="text-[10px] text-[var(--text-muted-30)]">&middot;</span>
                              <span className="text-[10px] text-[var(--text-muted-50)]">{doc.chunks} chunks</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-[10px] text-[var(--text-muted-30)]">{formatDate(doc.createdAt)}</span>
                          <button type="button" onClick={(e) => deleteDocument(doc.id, e)}
                            className="text-[var(--text-muted-30)] hover:text-red-400 transition-colors bg-transparent border-none cursor-pointer p-0 opacity-0 group-hover:opacity-100"
                            aria-label="Delete document">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )
            )}
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto bg-[var(--background)]">
          {tab === 'conversations' ? (
            selectedConv ? (
              <div className="max-w-3xl mx-auto py-8 px-6">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="font-['Playfair_Display'] text-xl text-[var(--text-primary)] truncate">
                    {selectedConv.title}
                  </h2>
                  <span className="text-xs text-[var(--text-muted-30)]">
                    {selectedConv.messages.length} messages
                  </span>
                </div>

                <div className="space-y-4">
                  {selectedConv.messages.map((msg, i) => (
                    <div key={msg.id} className={`flex gap-3 animate-fade-in-up ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`} style={{ animationDelay: `${i * 30}ms` }}>
                      <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
                        msg.role === 'user' ? 'bg-[var(--surface-hover)]' : 'bg-[var(--accent)]/15 ring-1 ring-[var(--accent)]/20'
                      }`}>
                        {msg.role === 'user'
                          ? <User className="h-3.5 w-3.5 text-[var(--text-muted-70)]" />
                          : <Bot className="h-3.5 w-3.5 text-[var(--accent)]" />
                        }
                      </div>
                      <div className={`max-w-[75%] min-w-0 ${msg.role === 'user' ? 'text-right' : ''}`}>
                        <div className={`inline-block text-left rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words shadow-soft ${
                          msg.role === 'user'
                            ? 'bg-[var(--accent)] text-white rounded-tr-md'
                            : 'bg-[var(--surface)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-tl-md'
                        }`}>
                          {msg.content}
                        </div>
                        <p className="text-[10px] text-[var(--text-muted-30)] mt-1">
                          {new Date(msg.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <MessageSquare className="h-12 w-12 text-[var(--text-muted-30)] mx-auto mb-4" />
                  <h3 className="font-['Playfair_Display'] text-lg text-[var(--text-primary)] mb-1">Select a conversation</h3>
                  <p className="text-sm text-[var(--text-muted-50)]">Choose a conversation from the sidebar to view messages.</p>
                </div>
              </div>
            )
          ) : (
            docDetail ? (
              <div className="max-w-3xl mx-auto py-8 px-6">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="font-['Playfair_Display'] text-xl text-[var(--text-primary)] truncate">
                    {docDetail.title}
                  </h2>
                  <span className="text-xs text-[var(--text-muted-30)]">
                    {formatDate(docDetail.createdAt)}
                  </span>
                </div>

                <div className="bg-[var(--surface)] border border-[var(--border-color)] rounded-2xl p-6 shadow-soft">
                  <pre className="text-sm text-[var(--text-primary)] whitespace-pre-wrap font-sans leading-relaxed">
                    {docDetail.content || '(Empty document)'}
                  </pre>
                </div>
              </div>
            ) : docDetailLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-6 w-6 text-[var(--accent)] animate-spin" />
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <FileText className="h-12 w-12 text-[var(--text-muted-30)] mx-auto mb-4" />
                  <h3 className="font-['Playfair_Display'] text-lg text-[var(--text-primary)] mb-1">Select a document</h3>
                  <p className="text-sm text-[var(--text-muted-50)]">Choose a document from the sidebar to view its content.</p>
                </div>
              </div>
            )
          )}
        </main>
      </div>
    </div>
  );
}
