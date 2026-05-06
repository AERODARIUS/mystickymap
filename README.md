# My Sticky Map 📍✨

**My Sticky Map** is an innovative augmented reality (AR) social application that allows users to "stick" digital notes to physical locations in the real world. By combining real-time geolocation with AR visualization, speech technology, and QR sharing, it creates a persistent layer of digital messages on top of the physical environment.

---

## 📱 Progressive Web App (PWA) Capabilities

My Sticky Map is engineered as a high-performance **Progressive Web App**, providing a native-like experience optimized for mobile utility and offline resilience.

### Core PWA Features
- **One-Tap Installation**: Add the app to your home screen for full-screen immersion, removing browser chrome and address bars.
- **Offline First Architecture**: 
  - **Service Workers**: Essential assets, map components, and core UI are cached for instant loading even without an internet connection.
  - **Firestore Persistence**: Your notes and local data are stored in an on-device database. You can drop notes while offline; they will automatically sync to the cloud once you're back in range.
- **App Shortcuts**: Long-press the icon on your home screen to jump directly to:
  - 🎥 **AR View**: Instant camera calibration and note discovery.
  - ➕ **Drop a Note**: Quick-entry mode for leaving a mark at your current position.
- **Background Sync**: Ensures data integrity during intermittent connectivity common in urban exploring.
- **Standalone Display**: Native look-and-feel with defined theme colors and splash screens.

### How to Install

#### Mobile (iOS & Android)
1.  Open the app in your mobile browser.
2.  **iOS**: Tap the **Share** button and select **"Add to Home Screen"**.
3.  **Android**: Look for the **"Install My Sticky Map"** prompt or select **"Install App"** from the browser menu.

#### Desktop
-   Click the **Install Icon** in the right side of the address bar (Chrome/Edge) to run Sticky Map as a standalone desktop application.

---

## 🚀 Key Features

### 1. 🌍 Perspectives & Discovery
- **2D Map View**: Interactive exploration of notes worldwide powered by Google Maps.
- **AR (Augmented Reality) View**: A heads-up display showing notes floating at their real-world coordinates relative to your camera.
- **Anchor View**: A location-aware list view showing notes sorted by "proximity to you," perfect for finding hidden gems nearby.

### 2. 📝 Advanced Note Creation
- **Voice Dictation**: Tap the microphone to convert your thoughts into text instantly using the Web Speech API.
- **Dynamic Styling**: Color-code your notes to match the mood or message.
- **Privacy Tiers**: 
  - **Public**: Visible to everyone on the map and AR view.
  - **Unlisted**: Only accessible via direct link or QR code.
  - **Private**: Secured for your eyes only.

### 3. 🏁 QR Integration & Sharing
- **QR Scanners**: Built-in scanner to instantly reveal hidden "Unlisted" notes found on physical stickers or signs.
- **QR Generation**: Every note can generate its own unique QR code, allowing you to bridge the physical-digital gap.

### 4. 🎙️ Accessibility & Localization
- **Text-to-Speech**: Have the app read notes aloud to you—ideal for eyes-up navigation.
- **Multilingual Support**: Fully localized in **English, Spanish, French, and Portuguese** with automatic language detection.

---

## 📱 Permissions Required

To provide the full AR and location experience, the app requires:
- **Location**: To place and find notes at specific coordinates.
- **Camera**: For the Augmented Reality view and QR scanning.
- **Microphone**: For voice-to-text dictation.
- **Motion/Orientation**: To orient the AR view correctly as you turn.

---

## 🛠️ Technology Stack

- **Frontend**: React 19, Vite, Tailwind CSS
- **PWA**: `vite-plugin-pwa` (Workbox)
- **Maps**: @vis.gl/react-google-maps
- **Backend/DB**: Firebase (Auth, Firestore, Hosting, Storage)
- **Configuration**: Firebase Remote Config for dynamic feature toggling.
- **QR Engine**: `html5-qrcode` & `qrcode.react`
- **Animations**: `motion` (Framer Motion)
- **Language**: `i18next`

---

## 👨‍💻 Developer Setup

### Running Locally with PWA Enabled
PWA features like service workers are typically disabled in development to prevent caching issues. To test the full PWA experience:

1.  **Install dependencies**:
    ```bash
    npm install
    ```
2.  **Set Environment Variables**:
    Add `GEMINI_API_KEY` and `GOOGLE_MAPS_PLATFORM_KEY` to your secrets.
3.  **Build & Preview**:
    ```bash
    npm run build
    npm run preview
    ```

### Deployment
The project is configured for **Firebase Hosting**.
```bash
npm run build
firebase deploy
```

---

## 📁 Key Project Files
- `/vite.config.ts`: Main PWA manifest and caching strategy definition.
- `src/hooks/useInstallPrompt.ts`: Logic for detecting and triggering the browser install prompt.
- `public/icon-512.svg`: The master SVG asset for icons, splash screens, and favicons.

