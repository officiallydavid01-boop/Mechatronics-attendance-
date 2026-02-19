import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, push, onValue, remove } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// --- FIREBASE CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyDEG1jzD0Kdhi8CC6Sx8p1vo0LaRyZ4OcU",
  authDomain: "mechatronics-attendance.firebaseapp.com",
  databaseURL: "https://mechatronics-attendance-default-rtdb.firebaseio.com",
  projectId: "mechatronics-attendance",
  storageBucket: "mechatronics-attendance.firebasestorage.app",
  messagingSenderId: "122666584321",
  appId: "1:122666584321:web:e8b8ef8ffac2c261d27300",
  measurementId: "G-18FRFN7P22"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// URL Parameters
const urlParams = new URLSearchParams(window.location.search);
const currentSession = urlParams.get('session');
const targetLat = parseFloat(urlParams.get('lat'));
const targetLon = parseFloat(urlParams.get('lon'));
const expiryTime = parseInt(urlParams.get('exp'));
let attendanceData = [];

// --- 1. OFFLINE PERSISTENCE HELP ---
if (currentSession) {
    const sessionRef = ref(db, `sessions/${currentSession}/attendance`);
    onValue(sessionRef, () => {}, { onlyOnce: false });
}

// --- 2. UTILITY: HAVERSINE DISTANCE ---
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; 
    const p1 = lat1 * Math.PI/180;
    const p2 = lat2 * Math.PI/180;
    const dLat = (lat2-lat1) * Math.PI/180;
    const dLon = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(p1) * Math.cos(p2) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return Math.round(R * c); 
}

// --- 3. ADMIN DASHBOARD LOGIC ---
document.getElementById('nav-btn').onclick = () => {
    const sSec = document.getElementById('student-section');
    const aSec = document.getElementById('admin-section');
    const btn = document.getElementById('nav-btn');
    if (aSec.classList.contains('hidden')) {
        sSec.classList.add('hidden'); aSec.classList.remove('hidden');
        btn.innerText = "Back to Form";
    } else {
        aSec.classList.add('hidden'); sSec.classList.remove('hidden');
        btn.innerText = "Admin Login";
    }
};

document.getElementById('loginBtn').onclick = () => {
    const pass = document.getElementById('adminPass').value;
    if (pass === "Mechatronics2024") {
        document.getElementById('admin-auth').classList.add('hidden');
        document.getElementById('admin-controls').classList.remove('hidden');
        if (currentSession) loadData(currentSession);
    } else { alert("Invalid Password"); }
};

document.getElementById('genLinkBtn').onclick = () => {
    const val = document.getElementById('className').value.trim();
    if (!val) return alert("Enter Course Code!");

    document.getElementById('genLinkBtn').innerText = "📍 Pinning Hall...";
    
    navigator.geolocation.getCurrentPosition((pos) => {
        const sessionID = val.replace(/\s+/g, '_');
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const exp = Date.now() + 3600000; 
        
        const fullLink = `${window.location.origin}${window.location.pathname}?session=${sessionID}&lat=${lat}&lon=${lon}&exp=${exp}`;
        
        document.getElementById('shareLinkContainer').classList.remove('hidden');
        document.getElementById('shareLink').innerText = fullLink;
        navigator.clipboard.writeText(fullLink);
        document.getElementById('genLinkBtn').innerText = "Generate New Link";
        alert("Success! Hall Location Captured & Link Copied.");
    }, () => {
        alert("GPS Error: Could not pin hall location. Enable GPS.");
        document.getElementById('genLinkBtn').innerText = "Generate New Link";
    }, { enableHighAccuracy: true });
};

// --- 4. STUDENT SUBMISSION ---
document.getElementById('submitBtn').onclick = () => {
    const name = document.getElementById('studentName').value.trim();
    const matric = document.getElementById('matricNo').value.trim();
    const msg = document.getElementById('msg');
    const btn = document.getElementById('submitBtn');
    
    if (expiryTime && Date.now() > expiryTime) return alert("Session Expired!");
    if (localStorage.getItem(`signed_${currentSession}`)) return alert("Already signed in!");
    if (!name || !matric || !currentSession) return alert("Fill all fields!");

    btn.disabled = true;
    btn.innerText = "Processing...";
    msg.classList.remove('hidden');
    msg.innerHTML = "🛰️ Verifying Location...";

    navigator.geolocation.getCurrentPosition((pos) => {
        const dist = getDistance(pos.coords.latitude, pos.coords.longitude, targetLat, targetLon);
        
        if (dist > 80) {
            msg.innerHTML = `❌ Access Denied: You are ${dist}m away.`;
            msg.className = "mt-4 p-4 rounded-xl text-center bg-red-100 text-red-700";
            btn.disabled = false;
            btn.innerText = "Submit Presence";
            return;
        }

        const sessionRef = ref(db, `sessions/${currentSession}/attendance`);
        onValue(sessionRef, (snapshot) => {
            const records = snapshot.val();
            let isDuplicate = false;
            if (records) {
                Object.values(records).forEach(r => { if (r.matric === matric) isDuplicate = true; });
            }

            if (isDuplicate) {
                msg.innerHTML = "❌ Matric already used.";
                msg.className = "mt-4 p-4 rounded-xl text-center bg-red-100 text-red-700";
                btn.disabled = false;
            } else {
                push(sessionRef, { name, matric, time: new Date().toLocaleString() })
                .then(() => {
                    localStorage.setItem(`signed_${currentSession}`, "true");
                    document.getElementById('form-container').classList.add('hidden');
                    msg.innerHTML = "✅ Presence Logged!";
                    msg.className = "mt-4 p-4 rounded-xl text-center bg-green-50 text-green-700";
                })
                .catch(() => {
                    msg.innerHTML = "⚠️ Network Weak. Syncing...";
                });
            }
        }, { onlyOnce: true });
    }, () => {
        alert("GPS Error. Enable location.");
        btn.disabled = false;
    }, { enableHighAccuracy: true, timeout: 10000 });
};

// --- 5. DATA MANAGEMENT ---
function loadData(sessionID) {
    onValue(ref(db, `sessions/${sessionID}/attendance`), (snap) => {
        const data = snap.val();
        const list = document.getElementById('attendance-list');
        list.innerHTML = ""; attendanceData = [];
        if (data) {
            Object.values(data).forEach(item => {
                attendanceData.push(item);
                list.innerHTML += `<tr class="border-b"><td class="p-4 font-bold text-gray-700">${item.name}</td><td class="p-4 font-mono text-blue-700">${item.matric}</td><td class="p-4 text-xs text-gray-400">${item.time}</td></tr>`;
            });
        }
    });
}

document.getElementById('downloadBtn').onclick = () => {
    if (!attendanceData.length) return alert("No data!");
    let csv = "Name,Matric,Time\n" + attendanceData.map(r => `"${r.name}","${r.matric}","${r.time}"`).join("\n");
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `Attendance_${currentSession}.csv`; a.click();
};

document.getElementById('clearBtn').onclick = () => {
    if (currentSession && confirm("Delete list?")) {
        remove(ref(db, `sessions/${currentSession}/attendance`));
    }
};
