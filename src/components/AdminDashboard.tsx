import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { NoteReport, Note, ModerationState, Comment } from '../types';
import { Shield, Trash2, CheckCircle, Clock, MapPin, AlertCircle, MessageCircle } from 'lucide-react';

export const AdminDashboard = ({ onClose }: { onClose: () => void }) => {
  const [reports, setReports] = useState<NoteReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'pending' | 'resolved' | 'dismissed'>('pending');

  useEffect(() => {
    const q = query(
      collection(db, 'reports'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newReports = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as NoteReport[];
      setReports(newReports);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'reports');
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const handleAction = async (report: NoteReport, action: 'dismiss' | 'remove') => {
    try {
      if (action === 'remove') {
        if (report.commentId && report.noteId) {
          // It's a comment report
          const commentRef = doc(db, 'notes', report.noteId, 'comments', report.commentId);
          await deleteDoc(commentRef);
        } else if (report.noteId) {
          // It's a note report
          const noteRef = doc(db, 'notes', report.noteId);
          await updateDoc(noteRef, { moderationState: 'removed' as ModerationState });
        }
        await updateDoc(doc(db, 'reports', report.id), { status: 'resolved' });
      } else {
        await updateDoc(doc(db, 'reports', report.id), { status: 'dismissed' });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `reports/${report.id}`);
    }
  };

  const filteredReports = reports.filter(r => r.status === filter);

  return (
    <div className="fixed inset-0 z-[110] bg-stone-50 flex flex-col animate-in fade-in duration-200">
      {/* Header */}
      <div className="bg-white border-b border-stone-200 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-stone-900 text-white rounded-xl">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-black text-stone-900 tracking-tight leading-none">Moderation Hub</h2>
            <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mt-1">Trust & Safety Dashboard</p>
          </div>
        </div>
        <button 
          onClick={onClose}
          className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-xl text-sm font-bold transition-all active:scale-95"
        >
          Close Hub
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-6 max-w-5xl mx-auto w-full">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
          <div className="flex gap-2 p-1 bg-stone-200/50 rounded-2xl">
            {(['pending', 'resolved', 'dismissed'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                  filter === f ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-400 hover:text-stone-600'
                }`}
              >
                {f} ({reports.filter(r => r.status === f).length})
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 text-amber-600 rounded-xl border border-amber-100">
            <AlertCircle className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase tracking-tight">Real-time mod active</span>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-8 h-8 border-4 border-stone-200 border-t-stone-900 rounded-full animate-spin" />
            <p className="text-stone-400 text-[10px] font-black uppercase tracking-widest">Accessing records...</p>
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-stone-200 rounded-[40px] p-24 flex flex-col items-center text-center gap-4">
            <div className="p-5 bg-stone-50 rounded-full text-stone-200">
              <CheckCircle className="w-16 h-16" />
            </div>
            <div>
              <p className="text-xl font-black text-stone-900 tracking-tight">Queue clear</p>
              <p className="text-stone-400 text-sm mt-1">No {filter} notes to moderate at this time.</p>
            </div>
          </div>
        ) : (
          <div className="grid gap-6">
            {filteredReports.map(report => (
              <ReportCard key={report.id} report={report} onAction={handleAction} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const ReportCard = ({ report, onAction }: { report: NoteReport, onAction: (r: NoteReport, a: 'dismiss' | 'remove') => void }) => {
  const [note, setNote] = useState<Note | null>(null);
  const [comment, setComment] = useState<Comment | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        if (report.noteId) {
          const snap = await getDoc(doc(db, 'notes', report.noteId));
          if (snap.exists()) {
            setNote({ id: snap.id, ...snap.data() } as Note);
          }
        }
        
        if (report.commentId && report.noteId) {
          const snap = await getDoc(doc(db, 'notes', report.noteId, 'comments', report.commentId));
          if (snap.exists()) {
            setComment({ id: snap.id, ...snap.data() } as Comment);
          }
        }
      } catch (e) {
        console.error("Failed to fetch reported content", e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [report.noteId, report.commentId]);

  return (
    <div className="bg-white rounded-[32px] border border-stone-100 shadow-sm overflow-hidden flex flex-col md:flex-row group hover:shadow-xl transition-all duration-300">
      {/* Left: Info */}
      <div className="flex-1 p-7 space-y-5">
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider ${
            report.reason === 'threat' || report.reason === 'hate_speech' ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-amber-50 text-amber-600 border border-amber-100'
          }`}>
            {report.reason.replace('_', ' ')}
          </span>
          <span className="text-[10px] font-bold text-stone-300 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            {report.createdAt.toDate().toLocaleString()}
          </span>
        </div>

        <div>
           <h4 className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-2 flex items-center gap-2">
            <div className="w-1 h-1 bg-stone-300 rounded-full" />
            Submission Details
          </h4>
          <p className="text-sm text-stone-600 bg-stone-50 p-4 rounded-2xl italic leading-relaxed">
            {report.details || "No additional comments provided by reporter."}
          </p>
        </div>

        {report.status === 'pending' && (
          <div className="flex gap-3 pt-2">
            <button 
              onClick={() => onAction(report, 'remove')}
              className="flex-1 px-5 py-3 bg-red-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-wider hover:bg-red-700 transition-all flex items-center justify-center gap-2 active:scale-95 shadow-lg shadow-red-600/10"
            >
              <Trash2 className="w-4 h-4" />
              Remove
            </button>
            <button 
              onClick={() => onAction(report, 'dismiss')}
              className="flex-1 px-5 py-3 bg-stone-100 text-stone-500 rounded-2xl text-[11px] font-black uppercase tracking-wider hover:bg-stone-200 transition-all flex items-center justify-center gap-2 active:scale-95"
            >
              <CheckCircle className="w-4 h-4" />
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* Right: Content Preview */}
      <div className="w-full md:w-96 bg-stone-50/50 p-7 border-t md:border-t-0 md:border-l border-stone-100 flex flex-col">
        <h4 className="text-[10px] font-black text-stone-300 uppercase tracking-widest mb-4">
          Target {report.commentId ? 'Comment' : 'Note'} Preview
        </h4>
        {loading ? (
          <div className="animate-pulse space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-stone-200 rounded-full" />
              <div className="h-4 bg-stone-200 rounded w-1/3" />
            </div>
            <div className="h-24 bg-stone-200 rounded-3xl w-full" />
          </div>
        ) : (!note && !comment) ? (
          <div className="flex flex-col items-center justify-center flex-1 text-stone-400 italic text-xs py-10 gap-2">
            <AlertCircle className="w-8 h-8 opacity-20" />
            {report.commentId ? 'Comment' : 'Note'} unavailable or deleted.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl shadow-sm border border-white" style={{ backgroundColor: note?.color || '#eee' }}>
                {report.commentId ? <MessageCircle className="w-5 h-5 text-stone-400" /> : (note?.emoji || '📍')}
              </div>
              <div>
                <p className="text-xs font-black text-stone-900">{comment ? comment.authorName : note?.authorName}</p>
                <div className="flex items-center gap-1 text-[9px] font-bold text-stone-400 mt-0.5">
                  <MapPin className="w-2.5 h-2.5" />
                  {note ? `${note.location.lat.toFixed(4)}, ${note.location.lng.toFixed(4)}` : 'Unknown Location'}
                </div>
              </div>
            </div>
            <div className="relative">
              <div className="absolute -left-2 top-0 bottom-0 w-1 bg-stone-200 rounded-full" style={{ backgroundColor: note?.color || '#eee' }} />
              <p className="text-xs text-stone-800 font-medium leading-relaxed bg-white p-4 rounded-2xl border border-stone-200 line-clamp-6 ml-1">
                {comment ? comment.content : note?.content}
              </p>
              {comment && (
                <p className="text-[9px] text-stone-400 mt-2 px-1 font-bold uppercase tracing-widest">
                  Replying to note by {note?.authorName}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
