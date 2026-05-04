# My Sticky Map 📍✨

**My Sticky Map** is an innovative augmented reality (AR) social application that allows users to "stick" digital notes to physical locations in the real world. By combining real-time geolocation with AR visualization and speech technology, it creates a persistent layer of digital messages on top of the physical environment.

## 🚀 Key Features

### 1. 🌍 Multiple Viewing Perspectives
- **Map View**: A sleek, interactive 2D map powered by Google Maps. See at a glance where notes are clustered around you.
- **AR View**: The signature experience. Use your camera and compass to see notes "floating" in the air at their exact geographic coordinates.
- **Nearby (Anchor) View**: A convenient list of notes sorted by distance. Perfect for quickly scanning what others have left nearby.

### 2. 📝 Creative Note Dropping
- **Voice-to-Text**: Don't want to type? Use the integrated speech recognition to dictate your thoughts directly into the map.
- **Custom Styling**: Choose from a palette of vibrant colors to make your notes stand out.
- **Privacy First**: Toggle between **Public** notes for the world to see, or **Private** notes for your own personal geo-reminders.

### 3. 🔗 Sharing & Connectivity
- **Permanent Links**: Each note generates a unique URL. Share the link, and others can teleport directly to that note on the map.
- **QR Code Generation**: Create a physical bridge to your digital note. Print or show a QR code that users can scan to instantly view your message.

### 4. 🎙️ High Accessibility
- **Listen Out Loud**: Every note can be read aloud using text-to-speech technology.
- **Multilingual Support**: Supports over 9 languages (English, Spanish, French, German, Japanese, Korean, etc.) with native playback.

### 5. 🛠️ Robust Infrastructure
- **Secure Authentication**: Powered by Firebase Auth (Google Login) to ensure your notes are tied to your identity.
- **Real-time Persistence**: Built on Firestore, ensuring that notes are "dropped" and saved instantly for all users.
- **Compass Calibration**: Advanced math (haversine formula and bearing calculations) ensures AR notes are positioned accurately relative to your heading.

---

## 🛠️ Technology Stack
- **Frontend**: React 18, Vite, Tailwind CSS
- **Maps**: @vis.gl/react-google-maps
- **AR/Camera**: Web MediaDevices API & DeviceOrientation API
- **Animations**: Framer Motion
- **Icons**: Lucide React
- **Backend**: Firebase (Firestore, Authentication)
- **AI/ML**: Web Speech API (Recognition & Synthesis)

---

## 🚩 Feature Flags (Remote Config)

This application uses **Firebase Remote Config** to manage feature rollout and application behavior without requiring a new deployment.

### Available Flags

| Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `enable_audio_notes` | Boolean | `true` | Enables/disables speech-to-text note creation. |
| `enable_ar_view` | Boolean | `true` | Toggles the availability of the AR View mode. |
| `enable_qr_scanner` | Boolean | `true` | Toggles the availability of the QR scanning mode. |
| `max_note_length` | Number | `500` | Sets the maximum character limit for sticky notes. |
| `highlight_note_color` | String | `#10b981` | Global brand color for markers and UI accents. |

### How to Configure

1. Go to the [Firebase Console](https://console.firebase.google.com/).
2. Select your project and navigate to **Run > Remote Config**.
3. You can use the values provided in `remote_config_template.json` in the root of this project to initialize your parameters.
4. Click **Publish changes** to push the new configuration to all active users.

---

## 📱 Permissions Required
To provide the full experience, this app requires:
- **Location**: To place notes and show your position on the map.
- **Camera**: For the Augmented Reality view.
- **Microphone**: For voice-to-text note creation.
