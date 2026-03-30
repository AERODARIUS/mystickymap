/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { APIProvider, Map, AdvancedMarker, Pin, InfoWindow, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { auth, db, googleProvider, signInWithPopup, onAuthStateChanged, handleFirestoreError, OperationType, Timestamp, ref, uploadBytes, getDownloadURL, storage } from './firebase';
import { collection, onSnapshot, addDoc, query, orderBy, updateDoc, doc } from 'firebase/firestore';
import { User } from 'firebase/auth';
import { MapPin, Camera, List, Plus, LogIn, LogOut, Compass, X, Send, Mic, Square, Play, Pause, Trash2, FileText, Volume2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const API_KEY = process.env.GOOGLE_MAPS_PLATFORM_KEY || '';
const hasValidKey = Boolean(API_KEY) && API_KEY !== 'YOUR_API_KEY';

interface Note {
  id: string;
  type: 'text' | 'audio';
  content?: string;
  audioUrl?: string;
  location: { lat: number; lng: number };
  authorId: string;
  createdAt: Timestamp;
  color?: string;
}

const SplashScreen = () => (
  <div className="flex items-center justify-center min-h-screen bg-stone-50 p-6 font-sans">
    <div className="max-w-md w-full text-center space-y-6">
      <div className="flex justify-center">
        <div className="p-4 bg-emerald-100 rounded-full">
          <MapPin className="w-12 h-12 text-emerald-600" />
        </div>
      </div>
      <h2 className="text-3xl font-bold text-stone-900 tracking-tight">Google Maps API Key Required</h2>
      <p className="text-stone-600">To enable geolocated AR notes, you need to add your Google Maps API key.</p>
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200 text-left space-y-4">
        <p className="font-semibold text-stone-800">Setup Instructions:</p>
        <ol className="list-decimal list-inside space-y-2 text-stone-600 text-sm">
          <li>Get an API Key from the <a href="https://console.cloud.google.com/google/maps-apis/credentials" target="_blank" rel="noopener" className="text-emerald-600 hover:underline">Google Cloud Console</a>.</li>
          <li>Open <strong>Settings</strong> (⚙️ gear icon, top-right).</li>
          <li>Select <strong>Secrets</strong>.</li>
          <li>Add <code>GOOGLE_MAPS_PLATFORM_KEY</code> as the name.</li>
          <li>Paste your key as the value and press Enter.</li>
        </ol>
      </div>
      <p className="text-xs text-stone-400 italic">The app will rebuild automatically once the key is added.</p>
    </div>
  </div>
);

const ErrorBoundary = ({ children }: { children: React.ReactNode }) => {
  const [hasError, setHasError] = useState(false);
  const [errorInfo, setErrorInfo] = useState<string | null>(null);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      setHasError(true);
      setErrorInfo(event.message);
    };
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (hasError) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-red-50 p-6">
        <div className="max-w-md bg-white p-8 rounded-2xl shadow-lg border border-red-100">
          <h2 className="text-xl font-bold text-red-600 mb-4">Something went wrong</h2>
          <p className="text-stone-600 mb-4">An error occurred in the application. Please try refreshing.</p>
          {errorInfo && (
            <pre className="bg-stone-100 p-4 rounded-lg text-xs overflow-auto max-h-40">
              {errorInfo}
            </pre>
          )}
          <button 
            onClick={() => window.location.reload()}
            className="mt-6 w-full py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-colors"
          >
            Reload App
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

const AudioPlayer = ({ url, color }: { url: string, color?: string }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!audioRef.current) {
      audioRef.current = new Audio(url);
      audioRef.current.onended = () => setIsPlaying(false);
    }

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  return (
    <button 
      onClick={togglePlay}
      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/20 hover:bg-white/30 transition-colors text-white"
    >
      {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
      <span className="text-xs font-bold">Listen Note</span>
    </button>
  );
};

const ARView = ({ notes, userLocation, heading }: { notes: Note[], userLocation: { lat: number, lng: number } | null, heading: number | null }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    async function setupCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Error accessing camera:", err);
      }
    }
    setupCamera();
    return () => {
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const calculateBearing = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    const θ = Math.atan2(y, x);
    return (θ * 180 / Math.PI + 360) % 360;
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-black">
      <video 
        ref={videoRef} 
        autoPlay 
        playsInline 
        className="absolute inset-0 w-full h-full object-cover opacity-70"
      />
      
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {userLocation && heading !== null && notes.map(note => {
          const bearing = calculateBearing(userLocation.lat, userLocation.lng, note.location.lat, note.location.lng);
          const distance = calculateDistance(userLocation.lat, userLocation.lng, note.location.lat, note.location.lng);
          
          // Field of view approx 60 degrees
          let relativeBearing = (bearing - heading + 540) % 360 - 180;
          
          if (Math.abs(relativeBearing) < 45 && distance < 100) {
            const x = (relativeBearing / 45) * 50 + 50; // percentage
            const scale = Math.max(0.2, 1 - (distance / 100));
            
            return (
              <motion.div 
                key={note.id}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale }}
                className="absolute p-4 rounded-xl shadow-2xl border border-white/20 backdrop-blur-md text-white max-w-[200px]"
                style={{ 
                  left: `${x}%`, 
                  top: '40%',
                  backgroundColor: note.color || 'rgba(16, 185, 129, 0.8)',
                  transform: `translate(-50%, -50%)`
                }}
              >
                {note.type === 'audio' ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Mic className="w-4 h-4" />
                      <span className="text-xs font-bold uppercase tracking-wider">Audio Note</span>
                    </div>
                    <AudioPlayer url={note.audioUrl!} color={note.color} />
                  </div>
                ) : (
                  <p className="text-sm font-medium line-clamp-3">{note.content}</p>
                )}
                <p className="text-[10px] mt-2 opacity-70">{Math.round(distance)}m away</p>
              </motion.div>
            );
          }
          return null;
        })}
      </div>

      <div className="absolute bottom-24 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 bg-black/40 backdrop-blur-md rounded-full text-white text-xs border border-white/10">
        <Compass className="w-3 h-3 animate-pulse" />
        <span>{heading !== null ? `Heading: ${Math.round(heading)}°` : 'Calibrating compass...'}</span>
      </div>
    </div>
  );
};

const NoteCreator = ({ 
  draftLocation, 
  onNoteCreated,
  color,
  setColor,
  editingNote
}: { 
  draftLocation: { lat: number, lng: number } | null, 
  onNoteCreated: () => void,
  color: string,
  setColor: (color: string) => void,
  editingNote?: Note | null
}) => {
  const [type, setType] = useState<'text' | 'audio'>(editingNote?.type || 'text');
  const [content, setContent] = useState(editingNote?.content || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Audio recording state
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number | null>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      
      const chunks: BlobPart[] = [];
      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        setAudioBlob(blob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);
      timerRef.current = window.setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Error starting recording:", err);
      alert("Could not access microphone. Please check permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftLocation || !auth.currentUser) return;
    if (type === 'text' && !content.trim()) return;
    if (type === 'audio' && !audioBlob && !editingNote?.audioUrl) return;

    setIsSubmitting(true);
    try {
      let audioUrl = editingNote?.audioUrl || '';
      if (type === 'audio' && audioBlob) {
        const audioRef = ref(storage, `audio_notes/${auth.currentUser.uid}_${Date.now()}.webm`);
        await uploadBytes(audioRef, audioBlob);
        audioUrl = await getDownloadURL(audioRef);
      }

      const noteData = {
        type,
        content: type === 'text' ? content : '',
        audioUrl: type === 'audio' ? audioUrl : '',
        location: draftLocation,
        authorId: auth.currentUser.uid,
        createdAt: editingNote ? editingNote.createdAt : Timestamp.now(),
        updatedAt: Timestamp.now(),
        color
      };

      if (editingNote) {
        await updateDoc(doc(db, 'notes', editingNote.id), noteData);
      } else {
        await addDoc(collection(db, 'notes'), noteData);
      }
      
      setContent('');
      setAudioBlob(null);
      onNoteCreated();
    } catch (error) {
      handleFirestoreError(error, editingNote ? OperationType.UPDATE : OperationType.CREATE, 'notes');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-white p-6 rounded-t-3xl shadow-2xl border-t border-stone-100">
      <div className="flex items-center justify-between mb-6">
        <div className="flex bg-stone-100 p-1 rounded-xl">
          <button 
            onClick={() => setType('text')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${type === 'text' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'}`}
          >
            Text
          </button>
          <button 
            onClick={() => setType('audio')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${type === 'audio' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'}`}
          >
            Audio
          </button>
        </div>
        <div className="flex gap-2">
          {['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'].map(c => (
            <button 
              key={c}
              onClick={() => setColor(c)}
              className={`w-6 h-6 rounded-full border-2 ${color === c ? 'border-stone-900' : 'border-transparent'}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {type === 'text' ? (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="What's on your mind at this spot?"
            className="w-full p-4 bg-stone-50 border border-stone-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all resize-none h-24 text-stone-800"
            maxLength={1000}
          />
        ) : (
          <div className="flex flex-col items-center justify-center p-8 bg-stone-50 border border-dashed border-stone-300 rounded-2xl space-y-4">
            {audioBlob ? (
              <div className="flex items-center gap-4 w-full">
                <div className="flex-1 bg-emerald-100 p-4 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-2 text-emerald-700">
                    <Mic className="w-4 h-4" />
                    <span className="font-bold">Audio Recorded</span>
                  </div>
                  <button 
                    type="button"
                    onClick={() => setAudioBlob(null)}
                    className="p-2 hover:bg-emerald-200 rounded-lg text-emerald-700 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${isRecording ? 'bg-red-100 animate-pulse' : 'bg-stone-200'}`}>
                  <Mic className={`w-8 h-8 ${isRecording ? 'text-red-600' : 'text-stone-500'}`} />
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-stone-900">
                    {isRecording ? `Recording... ${formatDuration(recordingDuration)}` : 'Record an audio note'}
                  </p>
                  <p className="text-xs text-stone-500 mt-1">Share your thoughts with your voice</p>
                </div>
                <button
                  type="button"
                  onClick={isRecording ? stopRecording : startRecording}
                  className={`px-8 py-3 rounded-full font-bold flex items-center gap-2 transition-all ${isRecording ? 'bg-red-600 text-white' : 'bg-stone-900 text-white'}`}
                >
                  {isRecording ? <Square className="w-4 h-4 fill-current" /> : <Mic className="w-4 h-4" />}
                  {isRecording ? 'Stop Recording' : 'Start Recording'}
                </button>
              </>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting || (type === 'text' ? !content.trim() : !audioBlob)}
          className="w-full py-4 bg-stone-900 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {isSubmitting ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Send className="w-5 h-5" />}
          {isSubmitting ? 'Dropping...' : 'Drop Note Here'}
        </button>
      </form>
    </div>
  );
};

const MapController = ({ 
  isCreating, 
  editingNote, 
  userLocation, 
  setDraftLocation, 
  setDraftColor 
}: {
  isCreating: boolean;
  editingNote: Note | null;
  userLocation: { lat: number, lng: number } | null;
  setDraftLocation: (loc: { lat: number, lng: number } | null) => void;
  setDraftColor: (color: string) => void;
}) => {
  const map = useMap();

  useEffect(() => {
    if (isCreating && userLocation && map) {
      setDraftLocation(userLocation);
      map.panTo(userLocation);
      map.setZoom(17);
    } else if (editingNote && map) {
      setDraftLocation(editingNote.location);
      setDraftColor(editingNote.color || '#10b981');
      map.panTo(editingNote.location);
      map.setZoom(17);
    } else if (!isCreating && !editingNote) {
      setDraftLocation(null);
    }
  }, [isCreating, editingNote, userLocation, map, setDraftLocation, setDraftColor]);

  return null;
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [view, setView] = useState<'map' | 'ar'>('map');
  const [notes, setNotes] = useState<Note[]>([]);
  const [userLocation, setUserLocation] = useState<{ lat: number, lng: number } | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [draftColor, setDraftColor] = useState('#10b981');
  const [draftLocation, setDraftLocation] = useState<{ lat: number, lng: number } | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setIsAuthReady(true);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!isAuthReady || !user) return;

    const q = query(collection(db, 'notes'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newNotes = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Note[];
      setNotes(newNotes);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'notes');
    });

    return unsubscribe;
  }, [isAuthReady, user]);

  useEffect(() => {
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => console.error(err),
      { enableHighAccuracy: true }
    );

    const handleOrientation = (e: any) => {
      if (e.webkitCompassHeading) {
        setHeading(e.webkitCompassHeading);
      } else if (e.alpha !== null) {
        setHeading(360 - e.alpha);
      }
    };

    window.addEventListener('deviceorientation', handleOrientation);
    return () => {
      navigator.geolocation.clearWatch(watchId);
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleLogout = () => auth.signOut();

  if (!hasValidKey) return <SplashScreen />;

  if (!isAuthReady) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-stone-50">
        <div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-stone-50 p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white p-10 rounded-3xl shadow-xl border border-stone-100 text-center space-y-8"
        >
          <div className="flex justify-center">
            <div className="p-5 bg-emerald-50 rounded-3xl">
              <Compass className="w-12 h-12 text-emerald-600" />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-stone-900 tracking-tight">GeoNotes AR</h1>
            <p className="text-stone-500">Leave digital memories in physical spaces.</p>
          </div>
          <button 
            onClick={handleLogin}
            className="w-full py-4 bg-stone-900 text-white rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-stone-800 transition-all shadow-lg"
          >
            <LogIn className="w-5 h-5" />
            Sign in with Google
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <APIProvider apiKey={API_KEY} version="weekly">
        <div className="relative w-full h-screen bg-stone-50 font-sans overflow-hidden">
          {/* Main View */}
          <div className="absolute inset-0">
            {view === 'map' ? (
              <Map
                defaultCenter={userLocation || { lat: 37.42, lng: -122.08 }}
                defaultZoom={15}
                mapId="DEMO_MAP_ID"
                {...{ internalUsageAttributionIds: ['gmp_mcp_codeassist_v1_aistudio'] } as any}
                style={{ width: '100%', height: '100%' }}
                gestureHandling="greedy"
                disableDefaultUI
                onClick={(e) => {
                  if ((isCreating || editingNote) && e.detail.latLng) {
                    setDraftLocation(e.detail.latLng);
                  }
                }}
              >
                <MapController 
                  isCreating={isCreating}
                  editingNote={editingNote}
                  userLocation={userLocation}
                  setDraftLocation={setDraftLocation}
                  setDraftColor={setDraftColor}
                />
                {userLocation && (
                  <AdvancedMarker position={userLocation}>
                    <div className="relative">
                      <div className="absolute inset-0 bg-blue-500 rounded-full animate-ping opacity-20" />
                      <div className="w-4 h-4 bg-blue-600 rounded-full border-2 border-white shadow-lg" />
                    </div>
                  </AdvancedMarker>
                )}

                {(isCreating || editingNote) && draftLocation && (
                  <AdvancedMarker 
                    position={draftLocation}
                    draggable={true}
                    onDragEnd={(e) => {
                      if (e.latLng) setDraftLocation({ lat: e.latLng.lat(), lng: e.latLng.lng() });
                    }}
                  >
                    <motion.div 
                      initial={{ scale: 0, y: 20 }}
                      animate={{ scale: 1, y: 0 }}
                      className="flex items-center justify-center w-12 h-12 rounded-full shadow-2xl border-4 border-white z-50 cursor-grab active:cursor-grabbing"
                      style={{ backgroundColor: draftColor }}
                    >
                      <Plus className="w-6 h-6 text-white" />
                      <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 border-r-4 border-b-4 border-white" style={{ backgroundColor: draftColor }} />
                      <div className="absolute -inset-4 border-2 border-dashed rounded-full animate-[spin_4s_linear_infinite]" style={{ borderColor: draftColor, opacity: 0.5 }} />
                    </motion.div>
                  </AdvancedMarker>
                )}

                {notes.map(note => (
                  <AdvancedMarker 
                    key={note.id} 
                    position={note.location}
                    onClick={() => setSelectedNote(note)}
                  >
                    <div 
                      className="flex items-center justify-center w-10 h-10 rounded-full shadow-xl border-2 border-white transition-transform hover:scale-110 active:scale-95"
                      style={{ backgroundColor: note.color || '#10b981' }}
                    >
                      {note.type === 'audio' ? (
                        <Volume2 className="w-5 h-5 text-white fill-current" />
                      ) : (
                        <FileText className="w-5 h-5 text-white" />
                      )}
                      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 border-r-2 border-b-2 border-white" style={{ backgroundColor: note.color || '#10b981' }} />
                    </div>
                  </AdvancedMarker>
                ))}

                {selectedNote && (
                  <InfoWindow 
                    position={selectedNote.location} 
                    onCloseClick={() => setSelectedNote(null)}
                  >
                    <div className="p-2 max-w-[200px]">
                      {selectedNote.type === 'audio' ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-stone-900">
                            <Mic className="w-4 h-4" />
                            <span className="text-xs font-bold uppercase tracking-wider">Audio Note</span>
                          </div>
                          <div className="bg-stone-100 p-2 rounded-lg">
                            <AudioPlayer url={selectedNote.audioUrl!} />
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-stone-800 font-medium leading-relaxed">{selectedNote.content}</p>
                      )}
                      <p className="text-[10px] text-stone-400 mt-2">
                        {selectedNote.createdAt.toDate().toLocaleDateString()}
                      </p>
                      {selectedNote.authorId === user.uid && (
                        <button 
                          onClick={() => {
                            setEditingNote(selectedNote);
                            setSelectedNote(null);
                          }}
                          className="mt-2 w-full py-1 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded text-[10px] font-bold transition-colors"
                        >
                          Edit Note
                        </button>
                      )}
                    </div>
                  </InfoWindow>
                )}
              </Map>
            ) : (
              <ARView notes={notes} userLocation={userLocation} heading={heading} />
            )}
          </div>

          {/* UI Overlays */}
          <div className="absolute top-6 left-6 right-6 flex justify-between items-start pointer-events-none">
            <div className="flex gap-2 pointer-events-auto">
              <button 
                onClick={() => setView('map')}
                className={`p-3 rounded-2xl shadow-lg border transition-all ${view === 'map' ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-600 border-stone-100'}`}
              >
                <List className="w-5 h-5" />
              </button>
              <button 
                onClick={() => setView('ar')}
                className={`p-3 rounded-2xl shadow-lg border transition-all ${view === 'ar' ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-600 border-stone-100'}`}
              >
                <Camera className="w-5 h-5" />
              </button>
            </div>

            <button 
              onClick={handleLogout}
              className="p-3 bg-white text-stone-600 rounded-2xl shadow-lg border border-stone-100 pointer-events-auto hover:bg-stone-50 transition-all"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>

        {/* FAB and Creator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-full max-w-md px-6 pointer-events-none">
          <AnimatePresence>
            {(isCreating || editingNote) ? (
              <motion.div 
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                className="pointer-events-auto"
              >
                <div className="flex justify-end mb-4">
                  <button 
                    onClick={() => {
                      setIsCreating(false);
                      setEditingNote(null);
                    }}
                    className="p-3 bg-white text-stone-900 rounded-full shadow-xl border border-stone-100"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
                <NoteCreator 
                  draftLocation={draftLocation} 
                  onNoteCreated={() => {
                    setIsCreating(false);
                    setEditingNote(null);
                  }} 
                  color={draftColor}
                  setColor={setDraftColor}
                  editingNote={editingNote}
                />
              </motion.div>
            ) : (
                <div className="flex justify-center pointer-events-auto">
                  <button 
                    onClick={() => setIsCreating(true)}
                    className="group flex items-center gap-3 px-8 py-4 bg-stone-900 text-white rounded-full shadow-2xl hover:bg-stone-800 transition-all scale-110"
                  >
                    <Plus className="w-6 h-6 group-hover:rotate-90 transition-transform" />
                    <span className="font-bold">Drop a Note</span>
                  </button>
                </div>
              )}
            </AnimatePresence>
          </div>

          {/* Compass Indicator for AR */}
          {view === 'ar' && (
            <div className="absolute top-24 left-1/2 -translate-x-1/2 pointer-events-none">
              <div className="w-48 h-1 bg-white/20 rounded-full overflow-hidden">
                <motion.div 
                  className="h-full bg-emerald-500"
                  animate={{ x: heading ? (heading / 360) * 100 - 50 : 0 }}
                  transition={{ type: 'spring', stiffness: 50 }}
                />
              </div>
            </div>
          )}
        </div>
      </APIProvider>
    </ErrorBoundary>
  );
}

