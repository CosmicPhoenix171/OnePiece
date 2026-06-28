// ---------------------------------------------------------------
// Firebase Realtime Database — shared session config.
//
// To enable realtime sync for all players:
//   1. Create a Firebase project at https://console.firebase.google.com
//   2. In Build → Realtime Database, create a database (start in TEST mode
//      while playing; lock down later).
//   3. Project Settings → General → Your apps → Web app → register an app,
//      then copy the config values below.
//   4. Reload the page. Everyone who opens the same URL with the same
//      ?session=NAME query parameter will share state in real time.
//
// Leave apiKey empty to disable realtime sync (the app keeps working
// locally with localStorage).
// ---------------------------------------------------------------

window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyBjqXtmGjNjvAFtDEB9K6E-8Jl8d1llBuM",
  authDomain: "onepeace-389cd.firebaseapp.com",
  databaseURL: "https://onepeace-389cd-default-rtdb.firebaseio.com",
  projectId: "onepeace-389cd",
  storageBucket: "onepeace-389cd.firebasestorage.app",
  messagingSenderId: "244126010870",
  appId: "1:244126010870:web:4854cf1c672b21c7180bd7",
  measurementId: "G-WZPD09HDT5"
};

// Default session id when no ?session= query parameter is supplied.
window.FIREBASE_SESSION = "default";
