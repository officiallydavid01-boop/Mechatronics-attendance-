import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, push, set, onValue, remove } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// 1. YOUR FIREBASE CONFIG
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

// Initialize
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// --- GLOBAL VARIABLES ---
const urlParams = new URLSearchParams(window.location.search);
const currentSession = urlParams.get('session'); // Get session from URL
let attendanceData = [];

// --- INITIAL UI SETUP ---
window.addEventListener('DOMContentLoaded', () => {
    const sessionIndicator = document.getElementById('session-indicator');
    const formTitle = document.getElementById('form-title');
    const formContainer = document.getElementById('form-container');

    if (currentSession) {
        // We are in a specific class
        const cleanName = currentSession.replace(/_/g, " ");
        sessionIndicator.innerText = "Current Session: " + cleanName;
        formTitle.innerText = cleanName + " Attendance";
    } else {
        // No session selected
        formContainer.innerHTML = `
            <div class="p-4 bg-yellow-50 border-2 border-yellow-200 rounded-xl text-yellow-800 text-sm">
                <strong>No Active Session:</strong> Please click the specific link provided by your lecturer to mark attendance.
            </div>
        `;
    }
});

// --- NAVIGATION / VIEW TOGGLE ---
document.getElementById('nav-btn').onclick = () => {
    const studentSec = document.getElementById('student-section');
    const adminSec = document.getElementById('admin-section');
    const navBtn = document.getElementById('nav-btn');

    if (adminSec.classList.contains('hidden')) {
        studentSec.classList.add('hidden');
        adminSec.classList.remove('hidden');
        navBtn.innerText = "Back to Form";
    } else {
        adminSec.classList.add('hidden');
        studentSec.classList.remove('hidden');
        navBtn.innerText = "Admin Login";
    }
};

// --- STUDENT SUBMISSION ---
document.getElementById('submitBtn').onclick = () => {
    if (!currentSession) {
        alert("Cannot submit without a valid session link!");
        return;
    }

    const name = document.getElementById('studentName').value.trim();
    const matric = document.getElementById('matricNo').value.trim();
    const time = new Date().toLocaleString();

    if (!name || !matric) {
        alert("Please enter both Name and Matric Number.");
        return;
    }

    // Save to sessions/SESSION_NAME/attendance
    const sessionRef = ref(db, `sessions/${currentSession}/attendance`);
    const newEntry = push(sessionRef);

    set(newEntry, { name, matric, time })
        .then(() => {
            document.getElementById('form-container').classList.add('hidden');
            const msg = document.getElementById('msg');
            msg.innerHTML = `✅ <strong>Success!</strong><br>Your attendance for ${currentSession.replace(/_/g, " ")} has been recorded.`;
            msg.className = "mt-4 p-4 rounded-xl text-center bg-green-100 text-green-800 block border-2 border-green-200";
        })
        .catch(err => alert("Error: " + err.message));
};

// --- ADMIN: LOGIN ---
document.getElementById('loginBtn').onclick = () => {
    const pass = document.getElementById('adminPass').value;
    if (pass === "Mechatronics2026") {
        document.getElementById('admin-auth').classList.add('hidden');
        document.getElementById('admin-controls').classList.remove('hidden');
        
        // If the admin is on a session link, load that data immediately
        if (currentSession) {
            loadAttendanceData(currentSession);
        }
    } else {
        alert("Unauthorized Access!");
    }
};

// --- ADMIN: GENERATE LINK ---
document.getElementById('genLinkBtn').onclick = () => {
    const rawName = document.getElementById('className').value.trim();
    if (!rawName) return alert("Enter a course code or class name!");

    // Sanitize: replace spaces with underscores
    const sessionID = rawName.replace(/\s+/g, '_');
    
    // Create the full URL
    const baseUrl = window.location.protocol + '//' + window.location.host + window.location.pathname;
    const fullLink = `${baseUrl}?session=${sessionID}`;

    // Display link
    const container = document.getElementById('shareLinkContainer');
    const linkEl = document.getElementById('shareLink');
    container.classList.remove('hidden');
    linkEl.innerText = fullLink;

    // Copy to clipboard
    navigator.clipboard.writeText(fullLink).then(() => {
        alert("Success! Link generated and copied to clipboard.");
    });

    // Automatically load data for this new session
    loadAttendanceData(sessionID);
};

// --- ADMIN: LOAD DATA ---
function loadAttendanceData(sessionID) {
    const dataRef = ref(db, `sessions/${sessionID}/attendance`);
    onValue(dataRef, (snapshot) => {
        const data = snapshot.val();
        const list = document.getElementById('attendance-list');
        list.innerHTML = "";
        attendanceData = [];

        if (data) {
            for (let id in data) {
                attendanceData.push(data[id]);
                list.innerHTML += `
                    <tr class="hover:bg-blue-50 transition border-b">
                        <td class="p-4 font-medium">${data[id].name}</td>
                        <td class="p-4 font-mono text-sm text-blue-600">${data[id].matric}</td>
                        <td class="p-4 text-xs text-gray-500 font-bold">${data[id].time}</td>
                    </tr>
                `;
            }
        } else {
            list.innerHTML = `<tr><td colspan="3" class="p-8 text-center text-gray-400 italic">No students have signed in for this session yet.</td></tr>`;
        }
    });
}

// --- ADMIN: DOWNLOAD CSV ---
document.getElementById('downloadBtn').onclick = () => {
    if (attendanceData.length === 0) return alert("No data to export!");

    let csv = "Full Name,Matric Number,Timestamp\n";
    attendanceData.forEach(row => {
        csv += `"${row.name}","${row.matric}","${row.time}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Attendance_${currentSession || 'export'}.csv`;
    a.click();
};

// --- ADMIN: CLEAR DATA ---
document.getElementById('clearBtn').onclick = () => {
    if (!currentSession) return alert("Please be on a specific class link to clear its data.");
    
    if (confirm(`Are you sure you want to delete ALL records for ${currentSession}?`)) {
        remove(ref(db, `sessions/${currentSession}/attendance`));
    }
};
