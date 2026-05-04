import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

const resources = {
  en: {
    translation: {
      nav: {
        map_view: "Map View",
        ar_view: "AR View",
        qr_notes: "QR Notes",
        nearby_notes: "Nearby Notes",
        change_view: "Change View",
        login_prompt: "To create notes, you must login.",
        login: "Login",
        drop_note: "Drop a Note"
      },
      creator: {
        edit_note: "Edit Note",
        new_note: "New Note",
        listening: "Listening...",
        placeholder: "What's on your mind at this spot?",
        speech: "Speech",
        waiting: "Waiting...",
        clear_text: "Clear text",
        private: "PRIVATE",
        public: "PUBLIC",
        live: "LIVE",
        dropping: "Dropping...",
        drop_note_here: "Drop Note Here"
      },
      splash: {
        heading: "Google Maps API Key Required",
        description: "To enable geolocated AR notes, you need to add your Google Maps API key.",
        instructions_heading: "Setup Instructions:",
        step1: "Get an API Key from the Google Cloud Console.",
        step2: "Open Settings (⚙️ gear icon, top-right).",
        step3: "Select Secrets.",
        step4: "Add GOOGLE_MAPS_PLATFORM_KEY as the name.",
        step5: "Paste your key as the value and press Enter.",
        footer: "The app will rebuild automatically once the key is added."
      },
      qr: {
        display: {
          title: "Note QR Code",
          description: "Scan this code to see the note in AR or QR mode.",
          download: "Download",
          share_text: "Scan this code to see the note!"
        },
        view: {
          scan_title: "Scan Note QR Code",
          captured_via: "Captured via QR",
          share_link: "Share link",
          you: "You"
        }
      },
      anchor: {
        title: "Nearby Notes",
        search_placeholder: "Search notes or authors...",
        radius_label: "Search Radius",
        away: "away",
        audio_message: "Audio Message",
        view_on_map: "View on Map",
        generate_qr: "Generate QR Code",
        share_link: "Share Link",
        edit_note: "Edit Note",
        delete_note: "Delete Note",
        delete_confirm: "Are you sure you want to delete this note?",
        no_notes: "No notes found in this area...",
        created_by: "Created by"
      },
      ar: {
        heading: "Heading: ",
        calibrating: "Calibrating compass...",
        edit_note: "Edit note"
      },
      speech: {
        stop: "Stop listening",
        listen: "Listen to note"
      }
    }
  },
  es: {
    translation: {
      nav: {
        map_view: "Vista de Mapa",
        ar_view: "Vista AR",
        qr_notes: "Notas QR",
        nearby_notes: "Notas Cercanas",
        change_view: "Cambiar Vista",
        login_prompt: "Para crear notas, debes iniciar sesión.",
        login: "Iniciar Sesión",
        drop_note: "Dejar una Nota"
      },
      creator: {
        edit_note: "Editar Nota",
        new_note: "Nueva Nota",
        listening: "Escuchando...",
        placeholder: "¿Qué tienes en mente en este lugar?",
        speech: "Voz",
        waiting: "Esperando...",
        clear_text: "Limpiar texto",
        private: "PRIVADA",
        public: "PÚBLICA",
        live: "EN VIVO",
        dropping: "Dejando...",
        drop_note_here: "Dejar Nota Aquí"
      },
      splash: {
        heading: "Se requiere clave de API de Google Maps",
        description: "Para habilitar notas AR geolocalizadas, debe agregar su clave de API de Google Maps.",
        instructions_heading: "Instrucciones de configuración:",
        step1: "Obtenga una clave de API de Google Cloud Console.",
        step2: "Abra Configuración (icono de engranaje ⚙️, arriba a la derecha).",
        step3: "Seleccione Secretos.",
        step4: "Agregue GOOGLE_MAPS_PLATFORM_KEY como nombre.",
        step5: "Pegue su clave como valor y presione Enter.",
        footer: "La aplicación se reconstruirá automáticamente una vez que se agregue la clave."
      },
      qr: {
        display: {
          title: "Código QR de la nota",
          description: "Escanee este código para ver la nota en modo AR o QR.",
          download: "Descargar",
          share_text: "¡Escanea este código para ver la nota!"
        },
        view: {
          scan_title: "Escanear código QR de la nota",
          captured_via: "Capturado vía QR",
          share_link: "Compartir enlace",
          you: "Tú"
        }
      },
      anchor: {
        title: "Notas Cercanas",
        search_placeholder: "Buscar notas o autores...",
        radius_label: "Radio de Búsqueda",
        away: "de distancia",
        audio_message: "Mensaje de Audio",
        view_on_map: "Ver en el Mapa",
        generate_qr: "Generar Código QR",
        share_link: "Compartir Enlace",
        edit_note: "Editar Nota",
        delete_note: "Borrar Nota",
        delete_confirm: "¿Estás seguro de que deseas borrar esta nota?",
        no_notes: "No se encontraron notas en esta área...",
        created_by: "Creado por"
      },
      ar: {
        heading: "Rumbo: ",
        calibrating: "Calibrando brújula...",
        edit_note: "Editar nota"
      },
      speech: {
        stop: "Dejar de escuchar",
        listen: "Escuchar nota"
      }
    }
  },
  pt: {
    translation: {
      nav: {
        map_view: "Vista de Mapa",
        ar_view: "Vista AR",
        qr_notes: "Notas QR",
        nearby_notes: "Notas Próximas",
        change_view: "Alterar Vista",
        login_prompt: "Para criar notas, você deve fazer login.",
        login: "Entrar",
        drop_note: "Deixar uma Nota"
      },
      creator: {
        edit_note: "Editar Nota",
        new_note: "Nova Nota",
        listening: "Ouvindo...",
        placeholder: "O que você está pensando neste local?",
        speech: "Fala",
        waiting: "Aguardando...",
        clear_text: "Limpar texto",
        private: "PRIVADA",
        public: "PÚBLICA",
        live: "AO VIVO",
        dropping: "Deixando...",
        drop_note_here: "Deixar Nota Aqui"
      },
      splash: {
        heading: "Chave da API do Google Maps Necessária",
        description: "Para ativar notas de AR geolocalizadas, você precisa adicionar sua chave da API do Google Maps.",
        instructions_heading: "Instruções de Configuração:",
        step1: "Obtenha uma Chave de API no Google Cloud Console.",
        step2: "Abra as Configurações (ícone de engrenagem ⚙️, canto superior direito).",
        step3: "Selecione Secrets.",
        step4: "Adicione GOOGLE_MAPS_PLATFORM_KEY como nome.",
        step5: "Cole sua chave como valor e pressione Enter.",
        footer: "O aplicativo será reconstruído automaticamente assim que a chave for adicionada."
      },
      qr: {
        display: {
          title: "Código QR da Nota",
          description: "Escaneie este código para ver a nota no modo AR ou QR.",
          download: "Baixar",
          share_text: "Escaneie este código para ver a nota!"
        },
        view: {
          scan_title: "Escanear Código QR da Nota",
          captured_via: "Capturado via QR",
          share_link: "Compartilhar link",
          you: "Você"
        }
      },
      anchor: {
        title: "Notas Próximas",
        search_placeholder: "Buscar notas ou autores...",
        radius_label: "Raio de Busca",
        away: "de distância",
        audio_message: "Mensagem de Áudio",
        view_on_map: "Ver no Mapa",
        generate_qr: "Gerar Código QR",
        share_link: "Compartilhar Link",
        edit_note: "Editar Nota",
        delete_note: "Excluir Nota",
        delete_confirm: "Tem certeza que deseja excluir esta nota?",
        no_notes: "Nenhuma nota encontrada nesta área...",
        created_by: "Criado por"
      },
      ar: {
        heading: "Rumo: ",
        calibrating: "Calibrando bússola...",
        edit_note: "Editar nota"
      },
       speech: {
        stop: "Parar de ouvir",
        listen: "Ouvir nota"
      }
    }
  },
  fr: {
    translation: {
      nav: {
        map_view: "Vue Carte",
        ar_view: "Vue RA",
        qr_notes: "Notes QR",
        nearby_notes: "Notes à Proximité",
        change_view: "Changer de Vue",
        login_prompt: "Pour créer des notes, vous devez vous connecter.",
        login: "Connexion",
        drop_note: "Déposer une Note"
      },
      creator: {
        edit_note: "Modifier la Note",
        new_note: "Nouvelle Note",
        listening: "Écoute...",
        placeholder: "Qu'avez-vous en tête à cet endroit ?",
        speech: "Parole",
        waiting: "En attente...",
        clear_text: "Effacer le texte",
        private: "PRIVÉ",
        public: "PUBLIC",
        live: "EN DIRECT",
        dropping: "Dépose...",
        drop_note_here: "Déposer la Note Ici"
      },
      splash: {
        heading: "Clé API Google Maps Requise",
        description: "Pour activer les notes RA géolocalisées, vous devez ajouter votre clé API Google Maps.",
        instructions_heading: "Instructions d'Installation :",
        step1: "Obtenez une clé API sur la Google Cloud Console.",
        step2: "Ouvrez les Paramètres (icône d'engrenage ⚙️, en haut à droite).",
        step3: "Sélectionnez Secrets.",
        step4: "Ajoutez GOOGLE_MAPS_PLATFORM_KEY comme nom.",
        step5: "Collez votre clé comme valeur et appuyez sur Entrée.",
        footer: "L'application se reconstruira automatiquement une fois la clé ajoutée."
      },
      qr: {
        display: {
          title: "Code QR de la Note",
          description: "Scannez ce code pour voir la note en mode RA ou QR.",
          download: "Télécharger",
          share_text: "Scannez ce code pour voir la note !"
        },
        view: {
          scan_title: "Scanner le Code QR de la Note",
          captured_via: "Capturé via QR",
          share_link: "Partager le lien",
          you: "Vous"
        }
      },
      anchor: {
        title: "Notes à Proximité",
        search_placeholder: "Rechercher des notes ou des auteurs...",
        radius_label: "Rayon de Recherche",
        away: "de distance",
        audio_message: "Message Audio",
        view_on_map: "Voir sur la Carte",
        generate_qr: "Générer le Code QR",
        share_link: "Partager le Lien",
        edit_note: "Modifier la Note",
        delete_note: "Supprimer la Note",
        delete_confirm: "Êtes-vous sûr de vouloir supprimer cette note ?",
        no_notes: "Aucune note trouvée dans cette zone...",
        created_by: "Créé par"
      },
      ar: {
        heading: "Direction: ",
        calibrating: "Calibrage de la boussole...",
        edit_note: "Modifier la note"
      },
      speech: {
        stop: "Arrêter l'écoute",
        listen: "Écouter la note"
      }
    }
  }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    },
    detection: {
      order: ['navigator'],
      caches: []
    }
  });

export default i18n;
