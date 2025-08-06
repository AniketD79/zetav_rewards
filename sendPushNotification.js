const admin = require('./firebase'); // your firebase.js initialization

async function sendPushNotification(token, notification, data = {}) {
  const message = {
    token,
    notification, // { title, body }
    data,        
  };
  try {
    await admin.messaging().send(message);
  } catch (err) {
    console.error('Push notification error:', err);
  }
}

module.exports = sendPushNotification;
