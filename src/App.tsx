/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { APIProvider, Map } from '@vis.gl/react-google-maps';
import { auth, googleProvider, signInWithPopup, onAuthStateChanged, db, handleFirestoreError, OperationType, serverTimestamp, logAnalyticsEvent } from './firebase';
import { collection, addDoc, updateDoc, doc, Timestamp, deleteField } from 'firebase/firestore';
import { User } from 'firebase/auth';

// Components
import { SplashScreen } from './components/SplashScreen';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ARView } from './components/ARView';
import { MapController } from './components/MapController';
import { MapMarkers } from './components/MapMarkers';
import { NavigationUI } from './components/NavigationUI';
import { LocationPlacement } from './components/LocationPlacement';
import { AnchorView } from './components/AnchorView';
import { QRNotesView } from './components/QRNotesView';
import { QRCodeDisplay } from './components/QRCodeDisplay';
import { InstallPrompt } from './components/InstallPrompt';
import { CommentsView } from './components/CommentsView';
import { ReportModal } from './components/ReportModal';
import { AdminDashboard } from './components/AdminDashboard';
import { ConsentBanner } from './components/ConsentBanner';
import { GroupFilterProvider, useGroupFilter } from './context/GroupFilterContext';

// Hooks & Utils
import { useNotes } from './hooks/useNotes';
import { useAdmin } from './hooks/useAdmin';
import { useFeatureFlags } from './hooks/useFeatureFlags';
import { useLocation } from './hooks/useLocation';
import {
  ContentFormat,
  MAX_NOTE_LENGTH,
  MAX_NOTE_STORAGE_LENGTH,
  Note,
  Comment,
  NotePrivacy,
} from './types';
import { countVisibleCharacters, markdownToPlainText, validateContentLimits } from './lib/richText';
import { timestampToCalendarDate, validateExpirationDateInput } from './lib/expiration';
import { normalizeGroupName, resolveGroupSpelling, validateGroupName } from './lib/groups';
import { canUserAccessNote } from './lib/notesQuery';
import {
  DEFAULT_USER_ZOOM,
  resolveMapId,
  WORLD_VIEW_CENTER,
  WORLD_VIEW_ZOOM,
} from './lib/mapConfig';
import { copyTextToClipboard } from './lib/clipboard';

const metaEnv = (import.meta as unknown as { env?: Record<string, string> })?.env;
const API_KEY =
  process.env.GOOGLE_MAPS_PLATFORM_KEY ||
  metaEnv?.VITE_GOOGLE_MAPS_API_KEY ||
  metaEnv?.GOOGLE_MAPS_PLATFORM_KEY ||
  '';
const MAP_ID = resolveMapId(
  process.env.GOOGLE_MAPS_MAP_ID ||
    metaEnv?.VITE_GOOGLE_MAPS_MAP_ID ||
    metaEnv?.VITE_GOOGLE_MAPS_PLATFORM_MAP_ID ||
    metaEnv?.GOOGLE_MAPS_MAP_ID
);
const hasValidKey = Boolean(API_KEY) && API_KEY !== 'YOUR_API_KEY' && API_KEY !== 'undefined' && API_KEY !== '';

interface AppShellProps {
  user: User | null;
  isAuthReady: boolean;
  notes: Note[];
  myNotes: Note[];
  refreshNotes: () => void;
}

function AppShell({ user, isAuthReady, notes, myNotes, refreshNotes }: AppShellProps) {
  const [view, setView] = useState<'map' | 'ar' | 'anchor' | 'qr'>(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname;
      if (path === '/anchor') return 'anchor';
      if (path === '/ar') return 'ar';
      if (path === '/qr') return 'qr';
    }
    return 'map';
  });
  const [isCreating, setIsCreating] = useState(false);
  const [isTrackingLocation, setIsTrackingLocation] = useState(false);
  const [hasInitiallyPositioned, setHasInitiallyPositioned] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [placementStep, setPlacementStep] = useState<'editing_content' | 'placing_location'>('editing_content');
  
  // Note draft values preserved across step transitions
  const [draftContent, setDraftContent] = useState('');
  const [draftContentFormat, setDraftContentFormat] = useState<ContentFormat>('markdown');
  const [draftLanguage, setDraftLanguage] = useState(typeof navigator !== 'undefined' ? navigator.language : 'en-US');
  const [draftPrivacy, setDraftPrivacy] = useState<NotePrivacy>('public');
  const [draftColor, setDraftColor] = useState('#0d9488');
  const [draftEmoji, setDraftEmoji] = useState('📝');
  const [draftHasExpiration, setDraftHasExpiration] = useState(false);
  const [draftExpirationDate, setDraftExpirationDate] = useState('');
  const [draftGroup, setDraftGroup] = useState('');

  // Location tracking for note placement
  const [, setOriginalLocation] = useState<{ lat: number, lng: number } | null>(null);
  const [candidateLocation, setCandidateLocation] = useState<{ lat: number, lng: number } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [focusNonce, setFocusNonce] = useState(0);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [qrCodeNoteId, setQrCodeNoteId] = useState<string | null>(null);
  const [commentNote, setCommentNote] = useState<Note | null>(null);
  const [reportingNote, setReportingNote] = useState<Note | null>(null);
  const [reportingComment, setReportingComment] = useState<Comment | null>(null);
  const [showAdminHub, setShowAdminHub] = useState(false);
  const [isCookieConsentOpen, setIsCookieConsentOpen] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const hasHandledUrlNote = useRef(false);

  // Hooks
  const { flags } = useFeatureFlags();
  const { isAdmin } = useAdmin(user);
  const { availableGroups, filterNotes } = useGroupFilter();

  const filteredMapNotes = useMemo(() => filterNotes(notes), [filterNotes, notes]);

  const isSelectedNoteExcluded = Boolean(
    view === 'map' && selectedNote && filterNotes([selectedNote]).length === 0
  );
  const visibleSelectedNote = isSelectedNoteExcluded ? null : selectedNote;

  // Close open map popup permanently if active group filters exclude the selected note
  useEffect(() => {
    if (!isSelectedNoteExcluded) return;
    const timer = setTimeout(() => {
      setSelectedNote(null);
    }, 0);
    return () => clearTimeout(timer);
  }, [isSelectedNoteExcluded]);
  
  const handlePermissionDenied = useCallback(() => {
    setIsTrackingLocation(false);
  }, []);

  const handleInitialPositionComplete = useCallback(() => {
    setHasInitiallyPositioned(true);
  }, []);

  const { userLocation, heading, isPermissionDenied, isLocationUnavailable } = useLocation(isTrackingLocation, handlePermissionDenied);

  const handleStartCreate = useCallback(() => {
    setIsCreating(true);
    setEditingNote(null);
    setPlacementStep('editing_content');
    setDraftContent('');
    setDraftContentFormat('markdown');
    setDraftLanguage(typeof navigator !== 'undefined' ? navigator.language : 'en-US');
    setDraftPrivacy('public');
    setDraftColor('#10b981');
    setDraftEmoji('📝');
    setDraftHasExpiration(false);
    setDraftExpirationDate('');
    setDraftGroup('');
    
    const initLoc = userLocation || { lat: 37.42, lng: -122.08 };
    setOriginalLocation(initLoc);
    setCandidateLocation(initLoc);
    setView('map');
    logAnalyticsEvent('note_create_start');
  }, [userLocation]);

  const handleEditNote = useCallback((note: Note | null) => {
    setEditingNote(note);
    setIsCreating(false);
    if (note) {
      setCommentNote(null);
      setPlacementStep('editing_content');
      setDraftContent(note.content || '');
      setDraftContentFormat(note.contentFormat || 'plain');
      setDraftLanguage(note.language || (typeof navigator !== 'undefined' ? navigator.language : 'en-US'));
      setDraftPrivacy(note.privacy || 'public');
      setDraftColor(note.color || '#10b981');
      setDraftEmoji(note.emoji || '📝');
      const hasExp = note.expiresAt !== null && note.expiresAt !== undefined;
      setDraftHasExpiration(hasExp);
      setDraftExpirationDate(hasExp ? timestampToCalendarDate(note.expiresAt) : '');
      setDraftGroup(normalizeGroupName(note.group) || '');
      
      const loc = note.location || { lat: 37.42, lng: -122.08 };
      setOriginalLocation(loc);
      setCandidateLocation(loc);
      setView('map');
      logAnalyticsEvent('note_edit_start', { note_id: note.id });
    } else {
      setDraftHasExpiration(false);
      setDraftExpirationDate('');
      setDraftGroup('');
      setOriginalLocation(null);
      setCandidateLocation(null);
    }
  }, []);

  const handleProceedToPlacement = useCallback(() => {
    const visibleLength = countVisibleCharacters(
      markdownToPlainText(draftContent, draftContentFormat)
    );
    const validation = validateContentLimits(
      visibleLength,
      draftContent,
      MAX_NOTE_LENGTH,
      MAX_NOTE_STORAGE_LENGTH
    );
    if (!validation.valid) return;
    const expValidation = validateExpirationDateInput(draftHasExpiration, draftExpirationDate);
    if (!expValidation.valid) return;
    const groupValidation = validateGroupName(draftGroup);
    if (!groupValidation.valid) return;
    setPlacementStep('placing_location');
    setView('map');
    logAnalyticsEvent('note_placement_start', { privacy: draftPrivacy });
  }, [draftContent, draftContentFormat, draftPrivacy, draftHasExpiration, draftExpirationDate, draftGroup]);

  const handleReturnToEditor = useCallback(() => {
    setPlacementStep('editing_content');
  }, []);

  const handleConfirmPlacement = useCallback(async () => {
    if (!candidateLocation || !auth.currentUser) return;
    const visibleLength = countVisibleCharacters(
      markdownToPlainText(draftContent, draftContentFormat)
    );
    const validation = validateContentLimits(
      visibleLength,
      draftContent,
      MAX_NOTE_LENGTH,
      MAX_NOTE_STORAGE_LENGTH
    );
    if (!validation.valid) return;
    const expValidation = validateExpirationDateInput(draftHasExpiration, draftExpirationDate);
    if (!expValidation.valid) return;
    const groupValidation = validateGroupName(draftGroup);
    if (!groupValidation.valid) return;

    const resolvedGroup = resolveGroupSpelling(draftGroup, availableGroups);

    const expiresAtValue = expValidation.expiresAtDate
      ? Timestamp.fromDate(expValidation.expiresAtDate)
      : null;

    setIsSubmitting(true);
    try {
      if (editingNote) {
        const updates = {
          content: draftContent.trim(),
          contentFormat: draftContentFormat,
          privacy: draftPrivacy,
          updatedAt: serverTimestamp(),
          expiresAt: expiresAtValue,
          color: draftColor,
          emoji: draftEmoji,
          language: draftLanguage,
          authorName: (auth.currentUser.displayName || 'Explorer').substring(0, 100),
          location: candidateLocation,
          group: resolvedGroup ?? deleteField(),
        };
        await updateDoc(doc(db, 'notes', editingNote.id), updates);
        logAnalyticsEvent('note_update', { note_id: editingNote.id, privacy: draftPrivacy, has_expiration: draftHasExpiration });
      } else {
        const noteData = {
          type: 'text',
          content: draftContent.trim(),
          contentFormat: draftContentFormat,
          location: candidateLocation,
          authorId: auth.currentUser.uid,
          authorName: (auth.currentUser.displayName || 'Explorer').substring(0, 100),
          privacy: draftPrivacy,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          expiresAt: expiresAtValue,
          color: draftColor,
          emoji: draftEmoji,
          language: draftLanguage,
          moderationState: 'visible',
          ...(resolvedGroup ? { group: resolvedGroup } : {}),
        };
        const newRef = await addDoc(collection(db, 'notes'), noteData);
        logAnalyticsEvent('note_create', { note_id: newRef.id, privacy: draftPrivacy, has_expiration: draftHasExpiration });
      }

      setIsCreating(false);
      setEditingNote(null);
      setOriginalLocation(null);
      setCandidateLocation(null);
      setPlacementStep('editing_content');
      setDraftContent('');
      setDraftContentFormat('markdown');
      setDraftHasExpiration(false);
      setDraftExpirationDate('');
      setDraftGroup('');
    } catch (error) {
      try {
        handleFirestoreError(
          error,
          editingNote ? OperationType.UPDATE : OperationType.CREATE,
          editingNote ? `notes/${editingNote.id}` : 'notes'
        );
      } catch {
        // Logged and reported via handleFirestoreError; avoid unhandled rejection in async click handler
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [candidateLocation, editingNote, draftContent, draftContentFormat, draftPrivacy, draftColor, draftEmoji, draftLanguage, draftHasExpiration, draftExpirationDate, draftGroup, availableGroups]);

  const handleCancelNoteFlow = useCallback(() => {
    setIsCreating(false);
    setEditingNote(null);
    setOriginalLocation(null);
    setCandidateLocation(null);
    setPlacementStep('editing_content');
    setDraftContent('');
    setDraftContentFormat('markdown');
    setDraftHasExpiration(false);
    setDraftExpirationDate('');
    setDraftGroup('');
    logAnalyticsEvent('note_flow_cancel');
  }, []);

  const handleToggleTracking = useCallback((tracking: boolean) => {
    setIsTrackingLocation(tracking);
    logAnalyticsEvent('location_tracking_toggle', { enabled: tracking });
  }, []);

  const copyToClipboard = useCallback(async (id: string) => {
    try {
      const url = new URL(window.location.origin + window.location.pathname);
      url.searchParams.set('noteId', id);
      const copied = await copyTextToClipboard(url.toString());
      if (copied) {
        setCopyStatus(id);
        logAnalyticsEvent('share_note_link', { note_id: id });
        setTimeout(() => setCopyStatus(null), 2000);
      }
    } catch {
      // Never leak unhandled promise rejection from clipboard/share action
    }
  }, []);

  const handleSetView = useCallback((nextView: 'map' | 'ar' | 'anchor' | 'qr') => {
    setView(nextView);
    refreshNotes();
  }, [refreshNotes]);

  const handleFocusNote = useCallback((note: Note) => {
    setView('map');
    setSelectedNote(note);
    setFocusNonce((prev) => prev + 1);
    setIsTrackingLocation(false);
    logAnalyticsEvent('note_view', { note_id: note.id, privacy: note.privacy, mode: 'anchor_list' });
  }, []);

  useEffect(() => {
    logAnalyticsEvent('screen_view', { firebase_screen: view, screen_name: view });
  }, [view]);

  useEffect(() => {
    if (!isAuthReady || hasHandledUrlNote.current) return;

    const urlParams = new URLSearchParams(window.location.search);
    const noteIdFromUrl = urlParams.get('noteId');

    let isCancelled = false;

    if (noteIdFromUrl) {
      logAnalyticsEvent('qr_scan', { note_id: noteIdFromUrl, source: 'url_param' });
      logAnalyticsEvent('note_view', { note_id: noteIdFromUrl, mode: 'url_param' });

      const targetNote =
        notes.find(n => n.id === noteIdFromUrl) ||
        myNotes.find(n => n.id === noteIdFromUrl);
      if (targetNote) {
        hasHandledUrlNote.current = true;
        setTimeout(() => {
          if (!isCancelled) setCommentNote(targetNote);
        }, 0);
      } else {
        // Even if we have other notes, this one isn't in the list
        // If not in the discovery list (e.g. Unlisted or out of range), try to fetch it directly
        (async () => {
          try {
            const [{ db: firestoreDb }, { doc, getDoc }] = await Promise.all([
              import('./firebase'),
              import('firebase/firestore'),
            ]);
            if (isCancelled) return;
            const docSnap = await getDoc(doc(firestoreDb, 'notes', noteIdFromUrl));
            if (isCancelled) return;
            if (docSnap.exists()) {
              const data = docSnap.data();
              const fetchedNote = {
                id: docSnap.id,
                ...data,
              } as Note;

              if (canUserAccessNote(fetchedNote, user?.uid, Date.now(), isAdmin)) {
                hasHandledUrlNote.current = true;
                setTimeout(() => {
                  if (!isCancelled) setCommentNote(fetchedNote);
                }, 0);
              }
            }
          } catch {
            // Silently fail if not found, chunk load fails, or no permission
            console.debug("Note from URL not accessible:", noteIdFromUrl);
          }
        })();
      }
    }

    return () => {
      isCancelled = true;
    };
  }, [notes, myNotes, isAuthReady, user?.uid, isAdmin]);

  const handleLogin = async () => {
    setLoginError(null);
    try {
      await signInWithPopup(auth, googleProvider);
      logAnalyticsEvent('login', { method: 'google' });
    } catch (error) {
      console.error("Login failed:", error);
      const firebaseError = error as { code?: string; message?: string };
      const errorMessage = firebaseError.message || "";
      
      if (firebaseError.code === 'auth/unauthorized-domain' || errorMessage.includes('auth/requests-from-referer')) {
        const domain = window.location.origin;
        setLoginError(
          `Domain Blocked: This environment's URL (${domain}) is not allowlisted in your Google Cloud / Firebase config. ` +
          `Please follow these steps: 1. Go to your Google Cloud Console > APIs & Services > Credentials. 2. Find the API Key. 3. Add "${domain}/*" to "Website restrictions". 4. Also check Firebase Console > Authentication > Settings > Authorized domains.`
        );
      } else {
        setLoginError("Login failed: " + (firebaseError.message || "Unknown error"));
      }
    }
  };

  const handleLogout = async () => {
    try {
      logAnalyticsEvent('logout');
      await auth.signOut();
      window.location.reload();
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  return (
    <>
      <div className="relative w-full h-[100dvh] bg-stone-50 font-sans overflow-hidden">
        {/* Main View */}
        <div className="absolute inset-0">
          {view === 'map' ? (
            <Map
              defaultCenter={visibleSelectedNote?.location || userLocation || WORLD_VIEW_CENTER}
              defaultZoom={visibleSelectedNote?.location || userLocation ? DEFAULT_USER_ZOOM : WORLD_VIEW_ZOOM}
              mapId={MAP_ID}
              clickableIcons={false}
              style={{ width: '100%', height: '100%' }}
              gestureHandling="greedy"
              disableDefaultUI
              internalUsageAttributionIds={["gmp_mcp_codeassist_v1_aistudio"]}
            >
              <MapController 
                isCreating={isCreating}
                editingNote={editingNote}
                placementStep={placementStep}
                userLocation={userLocation}
                candidateLocation={candidateLocation}
                setCandidateLocation={setCandidateLocation}
                isTrackingLocation={isTrackingLocation}
                selectedNote={visibleSelectedNote}
                focusNonce={focusNonce}
                hasInitiallyPositioned={hasInitiallyPositioned}
                onInitialPositionComplete={handleInitialPositionComplete}
                isLocationDenied={isPermissionDenied || isLocationUnavailable}
              />
              
              <MapMarkers 
                user={user}
                notes={filteredMapNotes}
                userLocation={userLocation}
                isCreating={isCreating}
                editingNote={editingNote}
                placementStep={placementStep}
                draftLocation={candidateLocation}
                draftColor={draftColor}
                draftEmoji={draftEmoji}
                selectedNote={visibleSelectedNote}
                copyStatus={copyStatus}
                setDraftLocation={setCandidateLocation}
                setSelectedNote={setSelectedNote}
                setEditingNote={handleEditNote}
                copyToClipboard={copyToClipboard}
                onGenerateQRCode={(id) => setQrCodeNoteId(id)}
                onShowComments={setCommentNote}
                onReportNote={setReportingNote}
              />
            </Map>
          ) : view === 'ar' ? (
            <ARView 
              notes={notes} 
              userLocation={userLocation} 
              heading={heading} 
              user={user}
              setView={handleSetView}
              setEditingNote={handleEditNote}
              copyToClipboard={copyToClipboard}
              copyStatus={copyStatus}
              onShowComments={setCommentNote}
              onReportNote={setReportingNote}
            />
          ) : view === 'anchor' ? (
            <AnchorView 
              notes={notes}
              myNotes={myNotes}
              userLocation={userLocation}
              user={user}
              setEditingNote={handleEditNote}
              onFocusNote={handleFocusNote}
              copyToClipboard={copyToClipboard}
              copyStatus={copyStatus}
              onGenerateQRCode={(id) => setQrCodeNoteId(id)}
              onShowComments={setCommentNote}
              onReportNote={setReportingNote}
            />
          ) : (
            <QRNotesView 
              notes={notes}
              myNotes={myNotes}
              user={user}
              copyToClipboard={copyToClipboard}
              copyStatus={copyStatus}
              onShowComments={setCommentNote}
              onReportNote={setReportingNote}
            />
          )}
        </div>

        {(isCreating || editingNote) && placementStep === 'placing_location' && (
          <LocationPlacement 
            isCreating={isCreating}
            editingNote={editingNote}
            draftColor={draftColor}
            draftEmoji={draftEmoji}
            draftContent={draftContent}
            candidateLocation={candidateLocation}
            onEditNote={handleReturnToEditor}
            onConfirmLocation={handleConfirmPlacement}
            onCancel={handleCancelNoteFlow}
            isSubmitting={isSubmitting}
          />
        )}

        <NavigationUI 
          user={user}
          view={view}
          isTrackingLocation={isTrackingLocation}
          isPermissionDenied={isPermissionDenied}
          isCreating={isCreating}
          editingNote={editingNote}
          placementStep={placementStep}
          draftLocation={candidateLocation}
          draftColor={draftColor}
          draftEmoji={draftEmoji}
          draftContent={draftContent}
          draftContentFormat={draftContentFormat}
          draftLanguage={draftLanguage}
          draftPrivacy={draftPrivacy}
          draftHasExpiration={draftHasExpiration}
          draftExpirationDate={draftExpirationDate}
          draftGroup={draftGroup}
          availableGroups={availableGroups}
          setView={handleSetView}
          setIsTrackingLocation={handleToggleTracking}
          onStartCreate={handleStartCreate}
          onCancelNoteFlow={handleCancelNoteFlow}
          setDraftColor={setDraftColor}
          setDraftEmoji={setDraftEmoji}
          setDraftContent={setDraftContent}
          setDraftContentFormat={setDraftContentFormat}
          setDraftLanguage={setDraftLanguage}
          setDraftPrivacy={setDraftPrivacy}
          setDraftHasExpiration={setDraftHasExpiration}
          setDraftExpirationDate={setDraftExpirationDate}
          setDraftGroup={setDraftGroup}
          onProceedToPlacement={handleProceedToPlacement}
          handleLogin={handleLogin}
          handleLogout={handleLogout}
          heading={heading}
          isAdmin={isAdmin && flags.enableAdminHub}
          onOpenAdmin={() => {
            logAnalyticsEvent('admin_view');
            setShowAdminHub(true);
          }}
          onOpenCookieConsent={() => setIsCookieConsentOpen(true)}
        />

        {/* Login Error Toast */}
        {loginError && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 w-full max-w-xs px-4 z-[70]">
            <div className="bg-red-600 text-white p-4 rounded-xl shadow-2xl flex items-start gap-3 text-sm">
              <div className="flex-1">
                <p className="font-bold">Authentication Error</p>
                <p className="opacity-90 text-xs mt-1">{loginError}</p>
              </div>
              <button 
                onClick={() => setLoginError(null)}
                className="p-1 hover:bg-white/10 rounded-lg"
              >
                ✕
              </button>
            </div>
          </div>
        )}
      </div>

      <QRCodeDisplay 
        noteId={qrCodeNoteId || ''} 
        isOpen={!!qrCodeNoteId} 
        onClose={() => setQrCodeNoteId(null)} 
      />
      <CommentsView
        note={commentNote}
        isOpen={!!commentNote}
        user={user}
        onClose={() => setCommentNote(null)}
        onEditNote={handleEditNote}
        onReportComment={(c) => setReportingComment(c)}
        onReportNote={(n) => setReportingNote(n)}
      />
      <ReportModal
        note={reportingNote || (reportingComment ? commentNote : null)}
        comment={reportingComment}
        user={user}
        onClose={() => {
          setReportingNote(null);
          setReportingComment(null);
        }}
      />
      {showAdminHub && (
        <AdminDashboard
          user={user}
          onClose={() => setShowAdminHub(false)}
          onFocusNote={(note) => {
            handleFocusNote(note);
            setShowAdminHub(false);
          }}
        />
      )}
      <InstallPrompt />
      <ConsentBanner 
        isOpenManually={isCookieConsentOpen} 
        onCloseManual={() => setIsCookieConsentOpen(false)} 
      />
    </>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  const { notes, myNotes, refresh: refreshNotes } = useNotes(user, isAuthReady);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (userProfile) => {
      setUser(userProfile);
      setIsAuthReady(true);
      if (userProfile && typeof window !== 'undefined' && typeof window.gtag === 'function') {
        window.gtag('set', 'user_properties', {
          user_id: userProfile.uid,
        });
      }
    });
    return unsubscribe;
  }, []);

  if (!hasValidKey) return <SplashScreen />;

  if (!isAuthReady) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#081e2b]">
        <div className="w-10 h-10 border-4 border-teal-200/20 border-t-[#00a88f] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <APIProvider apiKey={API_KEY} version="weekly">
        <GroupFilterProvider notes={notes} myNotes={myNotes}>
          <AppShell
            user={user}
            isAuthReady={isAuthReady}
            notes={notes}
            myNotes={myNotes}
            refreshNotes={refreshNotes}
          />
        </GroupFilterProvider>
      </APIProvider>
    </ErrorBoundary>
  );
}

