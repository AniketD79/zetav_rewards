// firebase.js
const admin = require('firebase-admin');
const serviceAccount = require('./zeta-v-rewards-firebase-adminsdk-fbsvc-65569df6d2.json'); 

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

module.exports = admin;
