# My Sticky Map 📍✨

**My Sticky Map** is an innovative augmented reality (AR) social application that allows users to "stick" digital notes to physical locations in the real world. By combining real-time geolocation with AR visualization and speech technology, it creates a persistent layer of digital messages on top of the physical environment.

---

## 📱 Progressive Web App (PWA)

My Sticky Map is built as a high-performance **Progressive Web App**, providing a native-like experience directly through your browser.

### Supported PWA Features
- **Installability**: Add to your home screen for quick access and full-screen immersion.
- **Offline Resilience**: Essential app assets and previously viewed maps are cached using Service Workers.
- **Standalone Mode**: Runs in its own window without browser navigation UI for a true "App" feel.
- **Dynamic Shortcuts**: Long-press the app icon (on supported platforms) to jump directly to **AR View** or **Drop a Note**.
- **Background Persistence**: Leverages Firestore offline persistence to store your notes locally when connection is lost, syncing them automatically when you're back online.

### How to Install

#### Mobile (iOS & Android)
1.  Open the app in your mobile browser (Safari for iOS, Chrome for Android).
2.  **iOS**: Tap the **Share** button and select **"Add to Home Screen"**.
3.  **Android**: Tap the **"Install"** banner at the bottom or the three-dot menu and select **"Install App"**.

#### Desktop
-   Click the **Install Icon** in the URL bar (Chrome/Edge) or use the custom **Install UI** within the app.

### Offline Capabilities & Limitations
-   **Works Offline**: You can browse previously loaded notes and view cached areas of the map.
-   **Limited Offline**: Dynamic updates (newly dropped notes by others) and high-resolution map tiles for new areas require a data connection.
-   **Drafting**: You can drop notes while offline; they will be saved to local storage and published to the cloud once a connection is restored.

---

## 🚀 Key Features

### 1. 🌍 Multiple Viewing Perspectives
- **Map View**: A sleek, interactive 2D map powered by Google Maps.
- **AR View**: Use your camera and compass to see notes "floating" in the air.
- **Nearby (Anchor) View**: List of notes sorted by distance.

### 2. 📝 Creative Note Dropping
- **Voice-to-Text**: Dictate your thoughts using the integrated speech recognition.
- **Custom Styling**: Vibrant color palette for personalization.
- **Visibility Control**: Public, Unlisted, or Private notes.

### 3. 🎙️ High Accessibility
- **Listen Out Loud**: Every note can be read aloud using text-to-speech.
- **Multilingual Support**: Supports over 9 languages with native playback.

---

## 📱 Permissions Required
To provide the full experience, this app requires:
- **Location**: Required for placing notes and showing your position accurately.
- **Camera**: Required for the Augmented Reality (AR) view mode.
- **Microphone**: Required for voice-to-text dictation.
- **Motion/Orientation**: Required for the AR compass and directional accuracy.

### Known Limitations (iOS Safari)
-   **Motion Permissions**: iOS requires a manual user gesture to enable Device Orientation. The app will prompt you for this on the first AR view.
-   **Camera Permissions**: You must "Allow" camera access each session or save the app to your Home Screen to remember preferences.

---

## 🛠️ Technology Stack
- **Frontend**: React 18, Vite, Tailwind CSS
- **PWA**: `vite-plugin-pwa` (Workbox)
- **Maps**: @vis.gl/react-google-maps
- **AR/Camera**: Web MediaDevices & DeviceOrientation APIs
- **Animations**: `motion` (Framer Motion)
- **Backend**: Firebase (Firestore, Auth, Hosting)

---

## 👨‍💻 Developer Setup

### Running Locally with PWA Enabled
The PWA service worker is built into the production build. To test the PWA features locally:

1.  **Clone & Install**:
    ```bash
    npm install
    ```
2.  **Set Up Environment**:
    Create a `.env` file with your `GEMINI_API_KEY` and `GOOGLE_MAPS_PLATFORM_KEY`.
3.  **Build & Preview**:
    ```bash
    npm run build
    npm run preview
    ```
    *Note: PWA features (Service Workers) do not run in standard `npm run dev` mode to avoid caching issues during development.*

### Testing Installability
-   Use Chrome DevTools (Application Tab > Manifest) to verify the manifest and trigger install prompts.
-   Use **Lighthouse** to run a PWA audit.

### Deployment (Firebase Hosting)
This app is optimized for Firebase Hosting.
1.  Build the project: `npm run build`
2.  Deploy: `firebase deploy --only hosting`

---

## 📁 New File Structure
- `/public/icon-512.svg`: The primary app icon used for manifest and splash screens.
- `/vite.config.ts`: Configured with `VitePWA` for service worker generation and manifest management.
- `src/hooks/useInstallPrompt.ts`: Custom hook for managing the PWA installation lifecycle.
