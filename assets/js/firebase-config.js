// ===== FIREBASE CONFIG =====
const firebaseConfig = {
  apiKey: "AIzaSyA06b7H_S6wvNsDrG0duZGyBiG-HhI13PU",
  authDomain: "webblack-system.firebaseapp.com",
  databaseURL: "https://webblack-system-default-rtdb.firebaseio.com",
  projectId: "webblack-system",
  storageBucket: "webblack-system.firebasestorage.app",
  messagingSenderId: "14861249612",
  appId: "1:14861249612:web:60b00f93d22d11dc6f18e9",
  measurementId: "G-WN5Y283KWR"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();