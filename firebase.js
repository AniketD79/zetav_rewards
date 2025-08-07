// // firebase.js
// const admin = require('firebase-admin');
// const serviceAccount = require('./zeta-v-rewards-firebase-adminsdk-fbsvc-65569df6d2.json'); 

// admin.initializeApp({
//   credential: admin.credential.cert(serviceAccount),
// });

// module.exports = admin;




// firebase.js
const admin = require('firebase-admin');


admin.initializeApp({
  credential: admin.credential.cert({
    projectId:"zeta-v-rewards",
    clientEmail: "firebase-adminsdk-fbsvc@zeta-v-rewards.iam.gserviceaccount.com",
    privateKey: "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCWBZRume3g8g9/\nZ5uyOhwWufOLKbXopa8MdkcrUnozijl/zQhkQsL0dPf3uEeKjmOvdq2Kke0TroEv\nyH7vphmElbrBP9OJCDgCJ3zyN1D0erG3RaTd1Jw69cwRyN08IubFAUJtep6he2NL\nhlBXaDI57BfDO8I4j25Z5sRy+GZs/pVkGkmvwcpItPpUN03a/XSo1ivUtc2PVamD\n1TBgnNJbcQnqNLo48w7TfhxIwMZBwSujwgQ5yw1Yn+BZqy9hYXIgkLD9G27FIoP2\nfxp9g4FBH1iatz/Upetnvsho0zmVBmiE/pUccGryf8wg0XHun1o/ieQFU14+1vbJ\n417MauoTAgMBAAECggEAC4VoLcpCe3j7ebRSP7C4wYIMUw6j+rbmp5VZx9jwq46c\n9dSgJVr/L9jfxjVvwRNIUoxRrYehZlaLc0j5fpwJ76W0Du1A6JAqBPhVXyCiZfQa\nO9HsZGDUkq6XunHrk5e2k0CSgmfdUNdx+7XX666D1PDtrj+jncZeGidfxNiQvSP9\n5Q2HoLecdlqUWOX4B/Gn89SVd4/lW9AdERKR92MZZglHU8yda+tP8bPGDnZ/OWpo\ncpwIIrsf9aE9WWBmKFGXlJtZYJxfgkUBFXqEgID/wbeHBoTe6qqqHuDeUoTx+2Uk\nE7r/8mjbfMPOLDdcbb9enhH8/51vRERYrFgj0q5JWQKBgQDKm3SxskOcdlE9TtwM\nukYIfz+Uft+LP7jbUHQu6DF1/jcmIyHOs5pKp08A21o/CzU8G/AH45iQusYTXrO8\n+66ICAaWh2iOAuywUvSezyCImBfOmQRC4rfGFKuT8Ko+7Q/4Q4hNnm8DPMgZGxFY\nGpDgx9Fkx/8Ccd1cgwicwc8RlwKBgQC9jonJhPuz8+g0Rf0ot6WTDIR35MxLLRo+\nMcUNyB7SKLMhufQvzfGR0PKkSofCK1MGhTOoeTq+F2gEsj5TFEcjW+Mq5BZCvc9R\nMr6Ert6o+GoGhSNGNpFHRjT3+NVIJ+5TujW/tu6+P8ybkqsPpmQCeURExAwJHErI\n/GYRF/sC5QKBgQC8POyRgBczEfZuqIrnxFT25grTU4Er5dtA4CHhxtbVUog4haGO\nYu2x+Hn9SM8zDZ27KBW9rqZ7qRwIuQ7zQT6pohNE3a+1aWAwfhJKThRi9DQCPcZo\nwi2N+nxi6dGyvxv8Q/oqa02my1z5fl2B5sS+IsgYA3yY7+ODZTamNabGJwKBgBBG\ne8gktePWjlpmo/zp/7pnebw9ldjij31FkrDDPPo4amD78V5lZVdqxFqc15kxVRib\nOTs+5W9K3TCCCV3iwNTlX9Tf7pVebL2BCOCljxKc+aWDquqtZr3i5ktgPxfJ7emc\ndF74mvkUy0GUT0GxvKaFuPnah1oE5tro6O6Qy4mNAoGAGMsf/wAa2cOgiuSo/KlL\nWYzNPsVfxCMWjYNiSHRK6h9zavY7pVRbZ7tsvila3GOWPZHB8DOzIyRccduQr02j\nu9yVSd24FNoFj+WTBfckw8abKZ5tK/ek2bAS+7KhE0C9QHDRGAquwdU40RRCKu8v\nVApe89mYjL+vYnKv6vt+HQA=\n-----END PRIVATE KEY-----\n",
  }),
});


module.exports = admin;