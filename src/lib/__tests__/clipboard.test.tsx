import '@testing-library/jest-dom/vitest';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { copyTextToClipboard } from '../clipboard';
import { QRCodeDisplay } from '../../components/QRCodeDisplay';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback || _key,
  }),
}));

vi.mock('../../firebase', () => ({
  logAnalyticsEvent: vi.fn(),
}));

describe('copyTextToClipboard & QRCodeDisplay share safety', () => {
  const originalClipboard = navigator.clipboard;
  const originalExecCommand = document.execCommand;
  const originalShare = navigator.share;

  afterEach(() => {
    cleanup();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: originalClipboard,
    });
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: originalExecCommand,
    });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: originalShare,
    });
    vi.restoreAllMocks();
  });

  it('uses navigator.clipboard.writeText when available and permitted', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    const ok = await copyTextToClipboard('https://spotheon.app/?noteId=123');
    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith('https://spotheon.app/?noteId=123');
  });

  it('falls back to document.execCommand without rejecting when clipboard.writeText throws NotAllowedError', async () => {
    const writeText = vi
      .fn()
      .mockRejectedValue(new DOMException("Failed to execute 'writeText' on 'Clipboard': Write permission denied.", 'NotAllowedError'));
    const execCommand = vi.fn().mockReturnValue(true);

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: execCommand,
    });

    const ok = await copyTextToClipboard('https://spotheon.app/?noteId=abc');
    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(execCommand).toHaveBeenCalledWith('copy');
  });

  it('resolves to false cleanly when both clipboard API and execCommand fail', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('Clipboard unavailable'));
    const execCommand = vi.fn().mockImplementation(() => {
      throw new Error('execCommand blocked');
    });

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: execCommand,
    });

    await expect(copyTextToClipboard('https://spotheon.app/?noteId=xyz')).resolves.toBe(false);
  });

  it('falls back safely in QRCodeDisplay when navigator.share and clipboard.writeText reject', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('Share blocked', 'NotAllowedError'));
    const writeText = vi.fn().mockRejectedValue(new DOMException('Write denied', 'NotAllowedError'));
    const execCommand = vi.fn().mockReturnValue(true);

    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: share,
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: execCommand,
    });

    render(<QRCodeDisplay noteId="note-1" isOpen={true} onClose={vi.fn()} />);

    const shareButton = screen.getByTitle('Share');
    fireEvent.click(shareButton);

    await waitFor(() => {
      expect(share).toHaveBeenCalledTimes(1);
      expect(writeText).toHaveBeenCalledTimes(1);
      expect(execCommand).toHaveBeenCalledWith('copy');
    });
  });
});
