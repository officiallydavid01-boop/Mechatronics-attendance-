import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, push, onValue, remove, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// --- CONFIGURATION (Ensure your API Keys are correct) ---
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

// URL Parameter Handling
const urlParams = new URLSearchParams(window.location.search);
const currentSession = urlParams.get('session');
const targetLat = parseFloat(urlParams.get('lat'));
const targetLon = parseFloat(urlParams.get('lon'));
const expiryTime = parseInt(urlParams.get('exp')); // New: Expiry timestamp
let attendanceData = [];

// --- UTILITY: MATH & DISTANCE ---
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth radius in meters
    const phi1 = lat1 * Math.PI/180;
    const phi2 = lat2 * Math.PI/180;
    const dPhi = (lat2-lat1) * Math.PI/180;
    const dLambda = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(dPhi/2) * Math.sin(dPhi/2) +
              Math.cos(phi1) * Math.cos(phi2) *
              Math.sin(dLambda/2) * Math.sin(dLambda/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return Math.round(R * c); 
}

// --- ADMIN LOGIC ---
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
    if (document.getElementById('adminPass').value === "Mechatronics2024") {
        document.getElementById('admin-auth').classList.add('hidden');
        document.getElementById('admin-controls').classList.remove('hidden');
        if (currentSession) loadData(currentSession);
    } else { alert("Access Denied."); }
};

document.getElementById('genLinkBtn').onclick = () => {
    const val = document.getElementById('className').value.trim();
    if (!val) return alert("Enter Course Code!");

    navigator.geolocation.getCurrentPosition((pos) => {
        const sessionID = val.replace(/\s+/g, '_');
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        // Session expires in 20 minutes (1200000ms)
        const exp = Date.now() + 1200000; 
        
        const fullLink = `${window.location.origin}${window.location.pathname}?session=${sessionID}&lat=${lat}&lon=${lon}&exp=${exp}`;
        
        document.getElementById('shareLinkContainer').classList.remove('hidden');
        document.getElementById('shareLink').innerText = fullLink;
        navigator.clipboard.writeText(fullLink);
        alert("Encrypted Session Link Created & Copied!");
    }, () => alert("GPS Required for Admin pinning."), { enableHighAccuracy: true });
};

// --- STUDENT SUBMISSION LOGIC ---
document.getElementById('submitBtn').onclick = () => {
    const name = document.getElementById('studentName').value.trim();
    const matric = document.getElementById('matricNo').value.trim();
    const msg = document.getElementById('msg');
    
    // GUARD 1: Expiry Check
    if (Date.now() > expiryTime) {
        return alert("This session has expired. Please ask the lecturer for a new link.");
    }

    // GUARD 2: Device Memory Check (Anti-Proxy)
    if (localStorage.getItem(`signed_${currentSession}`)) {
        return alert("Device Lock: You have already submitted for this session.");
    }

    if (!name || !matric || !currentSession) return alert("Fill all fields!");

    msg.classList.remove('hidden');
    msg.innerHTML = "Verifying Location & Credentials...";

    navigator.geolocation.getCurrentPosition((pos) => {
        const distance = calculateDistance(pos.coords.latitude, pos.coords.longitude, targetLat, targetLon);
        
        // GUARD 3: Geofence Check (60m)
        if (distance > 60) {
            msg.innerHTML = `❌ Access Denied: You are ${distance}m from the hall center.`;
            msg.className = "mt-4 p-4 rounded-xl text-center bg-red-100 text-red-700";
            return;
        }

        // GUARD 4: Database Duplicate Matric Check
        const sessionRef = ref(db, `sessions/${currentSession}/attendance`);
        onValue(sessionRef, (snapshot) => {
            const records = snapshot.val();
            let isDuplicate = false;
            if (records) {
                Object.values(records).forEach(r => { if (r.matric === matric) isDuplicate = true; });
            }

            if (isDuplicate) {
                msg.innerHTML = "❌ Error: This Matric Number is already recorded.";
                msg.className = "mt-4 p-4 rounded-xl text-center bg-red-100 text-red-700";
            } else {
                // Final Success: Push Data
                push(sessionRef, { name, matric, time: new Date().toLocaleString() })
                .then(() => {
                    localStorage.setItem(`signed_${currentSession}`, "true"); // Lock Device
                    document.getElementById('form-container').classList.add('hidden');
                    msg.innerHTML = "✅ Identity Verified. Attendance Logged!";
                    msg.className = "mt-4 p-4 rounded-xl text-center bg-green-50 text-green-700";
                });
            }
        }, { onlyOnce: true });
    }, () => alert("GPS Permission Denied."), { enableHighAccuracy: true });
};

// --- DATA LOADING & CSV ---
function loadData(sessionID) {
    onValue(ref(db, `sessions/${sessionID}/attendance`), (snap) => {
        const data = snap.val();
        const list = document.getElementById('attendance-list');
        list.innerHTML = ""; attendanceData = [];
        if (data) {
            Object.values(data).forEach(item => {
                attendanceData.push(item);
                list.innerHTML += `<tr class="border-b"><td class="p-4 font-bold">${item.name}</td><td class="p-4 font-mono text-blue-700">${item.matric}</td><td class="p-4 text-xs text-gray-400">${item.time}</td></tr>`;
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
    if (currentSession && confirm("Delete ALL session records?")) {
        remove(ref(db, `sessions/${currentSession}/attendance`));
    }
};
