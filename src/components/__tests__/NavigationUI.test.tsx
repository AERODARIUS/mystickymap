import '@testing-library/jest-dom/vitest';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { User } from 'firebase/auth';
import { NavigationUI } from '../NavigationUI';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => {
      const dict: Record<string, string> = {
        'nav.map_view': 'Vista de Mapa',
        'nav.ar_view': 'Vista AR',
        'nav.qr_notes': 'Notas QR',
        'nav.nearby_notes': 'Notas Cercanas',
        'nav.change_view': 'Cambiar Vista',
        'nav.login_prompt': 'Para crear notas, debes iniciar sesión.',
        'nav.login': 'Iniciar Sesión',
        'nav.logout': 'Cerrar Sesión',
        'nav.hide_login_prompt': 'Ocultar aviso de inicio de sesión',
        'nav.drop_note': 'Dejar una Nota',
      };
      return dict[key] || fallback || key;
    },
    i18n: { language: 'es' },
  }),
}));

vi.mock('../../hooks/useFeatureFlags', () => ({
  useFeatureFlags: () => ({
    flags: {
      enableARView: true,
      enableQRScanner: true,
    },
    loading: false,
  }),
}));

function renderNavigationUI(overrides: Partial<React.ComponentProps<typeof NavigationUI>> = {}) {
  const defaultProps: React.ComponentProps<typeof NavigationUI> = {
    user: null,
    view: 'map',
    isTrackingLocation: false,
    isPermissionDenied: false,
    isCreating: false,
    editingNote: null,
    placementStep: 'editing_content',
    draftLocation: null,
    draftColor: '#0d9488',
    draftEmoji: '📝',
    draftContent: '',
    draftContentFormat: 'markdown',
    draftLanguage: 'es',
    draftPrivacy: 'public',
    setView: vi.fn(),
    setIsTrackingLocation: vi.fn(),
    onStartCreate: vi.fn(),
    onCancelNoteFlow: vi.fn(),
    setDraftColor: vi.fn(),
    setDraftEmoji: vi.fn(),
    setDraftContent: vi.fn(),
    setDraftContentFormat: vi.fn(),
    setDraftLanguage: vi.fn(),
    setDraftPrivacy: vi.fn(),
    onProceedToPlacement: vi.fn(),
    handleLogin: vi.fn(),
    handleLogout: vi.fn(),
    heading: null,
    ...overrides,
  };

  return {
    ...render(<NavigationUI {...defaultProps} />),
    props: defaultProps,
  };
}

describe('NavigationUI login banner dismissal', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows login banner by default when logged out and hides top-right login button', () => {
    renderNavigationUI({ user: null });

    expect(screen.getByTestId('login-prompt-banner')).toBeInTheDocument();
    expect(screen.queryByTestId('top-right-login-button')).not.toBeInTheDocument();
  });

  it('hides login banner on dismiss and shows top-right login button that triggers handleLogin', async () => {
    const handleLogin = vi.fn();
    renderNavigationUI({ user: null, handleLogin });

    fireEvent.click(screen.getByTestId('hide-login-prompt-button'));

    await waitFor(() => {
      expect(screen.queryByTestId('login-prompt-banner')).not.toBeInTheDocument();
    });
    const topRightLoginBtn = screen.getByTestId('top-right-login-button');
    expect(topRightLoginBtn).toBeInTheDocument();
    expect(window.localStorage.getItem('spotheon_login_banner_hidden')).toBe('true');

    fireEvent.click(topRightLoginBtn);
    expect(handleLogin).toHaveBeenCalledTimes(1);
  });

  it('remembers hidden preference on mount and keeps top-right login button visible', () => {
    window.localStorage.setItem('spotheon_login_banner_hidden', 'true');
    renderNavigationUI({ user: null });

    expect(screen.queryByTestId('login-prompt-banner')).not.toBeInTheDocument();
    expect(screen.getByTestId('top-right-login-button')).toBeInTheDocument();
  });

  it('shows logout button and hides login controls when user is authenticated', () => {
    window.localStorage.setItem('spotheon_login_banner_hidden', 'true');
    renderNavigationUI({ user: { uid: 'user-123' } as User });

    expect(screen.queryByTestId('login-prompt-banner')).not.toBeInTheDocument();
    expect(screen.queryByTestId('top-right-login-button')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Cerrar Sesión')).toBeInTheDocument();
  });
});
