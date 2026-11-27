/**
 * Safely copies text to the clipboard without throwing or leaving an unhandled promise rejection
 * in restricted environments (e.g., sandboxed iframes, denied clipboard permissions, or headless browsers).
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall back to execCommand('copy') when Async Clipboard API is blocked (e.g., NotAllowedError in iframe)
    }
  }

  if (typeof document !== 'undefined' && document.body && typeof document.execCommand === 'function') {
    let textarea: HTMLTextAreaElement | null = null;
    try {
      textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.top = '-9999px';
      textarea.style.left = '-9999px';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const succeeded = document.execCommand('copy');
      return Boolean(succeeded);
    } catch {
      return false;
    } finally {
      if (textarea && textarea.parentNode) {
        textarea.parentNode.removeChild(textarea);
      }
    }
  }

  return false;
}
