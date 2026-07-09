import {
  collection,
  getFirestore,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  setDoc,
  serverTimestamp,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js";

import { app } from "./firebase-config.js";

const db = getFirestore(app);

/* ----------------------------------------------------
   KIEPL ROUTE SECURITY
---------------------------------------------------- */

const currentPage = window.location.pathname.toLowerCase();

const publicPages = [
  "/public/login.html",
  "/public/index.html",
  "/public/loadingpage.html",
  "/public/joining.html"
];

const storedRole = localStorage.getItem("role");

let storedEmail = "";

if (storedRole === "Employee") {
  storedEmail = localStorage.getItem("employeeEmail") || "";
} else if (storedRole === "Supervisor") {
  storedEmail = localStorage.getItem("supEmail") || "";
} else if (storedRole === "AS") {
  storedEmail = localStorage.getItem("asEmail") || "";
} else if (storedRole === "HR") {
  storedEmail = localStorage.getItem("hrEmail") || "";
} else if (storedRole === "Site-Incharge") {
  storedEmail = localStorage.getItem("siEmail") || "";
} else if (storedRole === "Admin") {
  storedEmail = localStorage.getItem("adminEmail") || "";
}

const normalizedStoredEmail = String(storedEmail || "").trim().toLowerCase();

const isPublicPage = publicPages.some(page =>
  currentPage.includes(page.toLowerCase())
);

function secureLogout(message) {
  try {
    const activeTabKey = normalizedStoredEmail
      ? `kieplActiveTab:${storedRole || "guest"}:${normalizedStoredEmail}`
      : null;

    if (activeTabKey) {
      localStorage.removeItem(activeTabKey);
    }
  } catch (err) {
    console.error("secureLogout cleanup error:", err);
  }

  localStorage.clear();
  sessionStorage.clear();
  alert(message || "Session expired. Please login again.");
  window.location.href = "/public/login.html";
}

if (!isPublicPage) {
  if (!storedRole || !storedEmail) {
    secureLogout("Session expired. Please login again.");
  }
}

function blockWrongDashboard(expectedPath, roleName) {
  if (currentPage.includes(expectedPath.toLowerCase()) && storedRole !== roleName) {
    secureLogout("Unauthorized Access Blocked");
  }
}

/* ----------------------------------------------------
   SINGLE DEVICE LOGIN SECURITY
---------------------------------------------------- */

if (!isPublicPage && storedEmail) {
  const sessionEmail = normalizedStoredEmail || String(storedEmail).trim().toLowerCase();
  const sessionId = localStorage.getItem("sessionId") || crypto.randomUUID();
  localStorage.setItem("sessionId", sessionId);

  const sessionRef = doc(db, "ActiveSessions", sessionEmail);

  async function registerCurrentSession() {
    try {
      await setDoc(
        sessionRef,
        {
          sessionId,
          email: sessionEmail,
          role: storedRole,
          lastLogin: serverTimestamp()
        },
        { merge: true }
      );
    } catch (err) {
      console.error("Session Register Error:", err);
    }
  }

  async function forceLogout() {
    secureLogout("Your account was logged in from another device. You have been logged out.");
  }

  registerCurrentSession();

 

  setInterval(async () => {
    try {
      const snap = await getDoc(sessionRef);
      if (!snap.exists()) return;

      const data = snap.data();
      if (data.sessionId && data.sessionId !== sessionId) {
        forceLogout();
      }
    } catch (err) {
      console.error(err);
    }
  }, 60000);
}

/* ----------------------------------------------------
   ROLE VALIDATION
---------------------------------------------------- */

blockWrongDashboard("/admin-dashboard/", "Admin");
blockWrongDashboard("/hr-dashboard/", "HR");
blockWrongDashboard("/supervisor-dashboard/", "Supervisor");
blockWrongDashboard("/as-dashboard/", "AS");
blockWrongDashboard("/si-dashboard/", "Site-Incharge");
blockWrongDashboard("/employee-dashboard/", "Employee");

/* ----------------------------------------------------
   ACCOUNT LOCK CHECK
---------------------------------------------------- */

const ROLE_COLLECTION_MAP = {
  Employee: "Employee",
  Supervisor: "Supervisor",
  AS: "AS",
  HR: "HR",
  "Site-Incharge": "Site-Incharge",
  Admin: "Admin"
};

async function checkAccountLock() {
  if (isPublicPage || !storedRole || !normalizedStoredEmail) return;

  const collectionName = ROLE_COLLECTION_MAP[storedRole];
  if (!collectionName) return;

  try {
    const snap = await getDoc(doc(db, collectionName, normalizedStoredEmail));
    if (!snap.exists()) return;

    const data = snap.data() || {};

    const accountLocked = data.accountLocked === true;
    const lockUntilMs = data.lockUntil ? new Date(data.lockUntil).getTime() : 0;
    const stillLocked = accountLocked && (!lockUntilMs || Date.now() < lockUntilMs);

    if (stillLocked) {
      secureLogout("Your account is locked. Please contact admin.");
    }
  } catch (err) {
    console.error("Account lock check error:", err);
  }
}

if (!isPublicPage) {
  checkAccountLock();
  setInterval(checkAccountLock, 300000);
}

/* ----------------------------------------------------
   MULTIPLE TAB CONTROL
---------------------------------------------------- */

if (!isPublicPage && storedEmail) {
  const tabKey = `kieplActiveTab:${storedRole || "guest"}:${normalizedStoredEmail}`;
  const tabId = sessionStorage.getItem("kieplTabId") || crypto.randomUUID();

  sessionStorage.setItem("kieplTabId", tabId);
  localStorage.setItem(tabKey, tabId);

  window.addEventListener("storage", e => {
    if (e.key === tabKey && e.newValue !== tabId) {
      secureLogout("Another tab was opened. You have been logged out.");
    }
  });

  setInterval(() => {
    const currentTab = localStorage.getItem(tabKey);
    if (currentTab !== tabId) {
      secureLogout("Another tab detected. You have been logged out.");
    }
  }, 3000);
}

/* ----------------------------------------------------
   PREVENT BACK AFTER LOGOUT
---------------------------------------------------- */

window.history.forward();

function preventBackAccess() {
  window.history.forward();
}

setTimeout(preventBackAccess, 0);
window.onunload = function () {};

/* ----------------------------------------------------
   IDLE WARNING + AUTO LOGOUT
---------------------------------------------------- */

if (!isPublicPage) {
  let warningTimer;
  let logoutTimer;

  function ensureIdlePopup() {
    if (document.getElementById("idleWarningPopup")) return;

    const popup = document.createElement("div");
    popup.id = "idleWarningPopup";
    popup.style.cssText = `
      display:none;
      position:fixed;
      inset:0;
      background:rgba(0,0,0,0.72);
      z-index:999999;
      align-items:center;
      justify-content:center;
      padding:20px;
    `;

    popup.innerHTML = `
      <div style="
        background:#0f1d31;
        color:#fff;
        padding:24px;
        border-radius:18px;
        max-width:380px;
        width:100%;
        text-align:center;
        box-shadow:0 20px 50px rgba(0,0,0,.4);
        border:1px solid rgba(255,255,255,0.08);
      ">
        <h3 style="margin-bottom:10px; font-size:22px;">Session Expiring</h3>
        <p style="margin-bottom:18px; line-height:1.6; color:#d5dfef;">
          You will be logged out in 60 seconds due to inactivity.
        </p>
        <button id="stayLoggedInBtn" style="
          padding:10px 18px;
          border:none;
          border-radius:10px;
          background:#2d7dff;
          color:#fff;
          font-weight:700;
          cursor:pointer;
        ">Stay Logged In</button>
      </div>
    `;

    document.body.appendChild(popup);

    popup.querySelector("#stayLoggedInBtn").addEventListener("click", () => {
      hideIdleWarning();
      resetIdleTimers();
    });
  }

  function showIdleWarning() {
    ensureIdlePopup();
    const popup = document.getElementById("idleWarningPopup");
    if (popup) popup.style.display = "flex";
  }

  function hideIdleWarning() {
    const popup = document.getElementById("idleWarningPopup");
    if (popup) popup.style.display = "none";
  }

  function logoutDueToInactivity() {
    secureLogout("Session expired due to inactivity. Please login again.");
  }

  function resetIdleTimers() {
    clearTimeout(warningTimer);
    clearTimeout(logoutTimer);
    hideIdleWarning();

    warningTimer = setTimeout(() => {
      showIdleWarning();
    }, 14 * 60 * 1000);

    logoutTimer = setTimeout(() => {
      logoutDueToInactivity();
    }, 15 * 60 * 1000);
  }

  ["mousemove", "mousedown", "click", "scroll", "keydown", "touchstart"].forEach(event => {
    document.addEventListener(event, resetIdleTimers, true);
  });

  resetIdleTimers();
}

/* ----------------------------------------------------
   MENU OPTIONS
---------------------------------------------------- */

const EmployeeOptions = [
  { _id: 0, title: "Employee Attendance", path: "/public/Employee-Dashboard/attendance.html" },
  { _id: 1, title: "Employee Payment", path: "/public/Employee-Dashboard/Payment.html" },
  { _id: 2, title: "Payslip", path: "/public/Employee-Dashboard/payslip.html" },
  { _id: 3, title: "About", path: "/public/Employee-Dashboard/about.html" }
];

const SupervisorOptions = [
  { _id: 0, title: "Attendance", path: "/public/Supervisor-Dashboard/supAttendance.html" },
  { _id: 1, title: "Leave Application", path: "/public/Supervisor-Dashboard/supLeave.html" },
  { _id: 2, title: "Payment", path: "/public/Supervisor-Dashboard/supminepayment.html" },
  { _id: 3, title: "Employee list", path: "/public/Supervisor-Dashboard/employeelist.html" },
  { _id: 4, title: "Employee Attendance", path: "/public/Supervisor-Dashboard/supEmployeeAttendance.html" },
  { _id: 5, title: "CLMS Attendance", path: "/public/Supervisor-Dashboard/clmsattendance.html" },
  { _id: 6, title: "Store Equipment", path: "/public/Supervisor-Dashboard/supStoreequipment.html" },
  { _id: 7, title: "Extra Shift", path: "/public/Supervisor-Dashboard/extrashift.html" },
  { _id: 8, title: "OT", path: "/public/Supervisor-Dashboard/ot.html" },
  { _id: 9, title: "About", path: "/public/Supervisor-Dashboard/about.html" }
];

const ASOptions = [
  { _id: 0, title: "Attendance", path: "/public/AS-Dashboard/asAttendance.html" },
  { _id: 1, title: "Leave Application", path: "/public/AS-Dashboard/asLeave.html" },
  { _id: 2, title: "Payment", path: "/public/AS-Dashboard/asminepayment.html" },
  { _id: 3, title: "Employee list", path: "/public/AS-Dashboard/employeelist.html" },
  { _id: 4, title: "Employee Attendance", path: "/public/AS-Dashboard/asEmployeeAttendance.html" },
  { _id: 5, title: "Store Equipment", path: "/public/AS-Dashboard/asStoreequipment.html" },
  { _id: 6, title: "About", path: "/public/AS-Dashboard/about.html" }
];

const SiOptions = [
  { _id: 0, title: "Attendance", path: "/public/SI-Dashboard/simineattendance.html" },
  { _id: 1, title: "Leave Application", path: "/public/SI-Dashboard/simineleave.html" },
  { _id: 2, title: "Payment", path: "/public/SI-Dashboard/siminepayment.html" },
  { _id: 3, title: "Employee list", path: "/public/SI-Dashboard/employeelist.html" },
  { _id: 4, title: "Employee Attendance", path: "/public/SI-Dashboard/sitakeattendance.html" },
  { _id: 5, title: "Leave Approval", path: "/public/SI-Dashboard/sileaveapplicationapproval.html" },
  { _id: 6, title: "Store Equipment", path: "/public/SI-Dashboard/sistoreequipment.html" },
  { _id: 7, title: "Payment", path: "/public/SI-Dashboard/sipayment.html" },
  { _id: 8, title: "Allowance", path: "/public/SI-Dashboard/siallowance.html" },
  { _id: 9, title: "CLMS Attendance", path: "/public/SI-Dashboard/siclmsattendance.html" },
  { _id: 10, title: "Extra Shift", path: "/public/SI-Dashboard/extrashift.html" }
];

const HROptions = [
  { _id: 0, title: "Joining", path: "/public/HR-Dashboard/Hrjoining.html" },
  { _id: 1, title: "Employee Status", path: "/public/HR-Dashboard/HR-joining-status.html" },
  { _id: 2, title: "Employee list", path: "/public/HR-Dashboard/Hremployeelist.html" },
  { _id: 3, title: "Employee Attendance", path: "/public/HR-Dashboard/Hremployeeattendence.html" },
  { _id: 4, title: "Access", path: "/public/HR-Dashboard/Hrattendenceaccess.html" },
  { _id: 5, title: "Leave Approval", path: "/public/HR-Dashboard/Hrleaveapproval.html" },
  { _id: 6, title: "Store Equipment", path: "/public/HR-Dashboard/Hrstoreequipment.html" },
  { _id: 7, title: "Food Allowance", path: "/public/HR-Dashboard/foodallowance.html" },
  { _id: 8, title: "Allowance", path: "/public/HR-Dashboard/Hrallowance.html" },
  { _id: 9, title: "CLMS Attendance", path: "/public/HR-Dashboard/clmsupdate.html" },
  { _id: 10, title: "UID Change", path: "/public/HR-Dashboard/uidchange.html" }
];

const AdminOptions = [
  { _id: 0, title: "Employee Approval", path: "/public/Admin-Dashboard/admin-joining-approval.html" },
  { _id: 1, title: "Employee list", path: "/public/Admin-Dashboard/Adminemployeelist.html" },
  { _id: 2, title: "Employee Attendance", path: "/public/Admin-Dashboard/Adminemployeeattendence.html" },
  { _id: 3, title: "Employee Payment", path: "/public/Admin-Dashboard/Adminemployeepayment.html" },
  { _id: 4, title: "Advance Payment", path: "/public/Admin-Dashboard/Adminadvancepayment.html" },
  { _id: 5, title: "Leave Approval", path: "/public/Admin-Dashboard/Adminleaveapproval.html" },
  { _id: 6, title: "Store Equipment", path: "/public/Admin-Dashboard/Adminstoreequipment.html" },
  { _id: 7, title: "Allowance", path: "/public/Admin-Dashboard/Adminallowance.html" },
  { _id: 8, title: "Bonus", path: "/public/Admin-Dashboard/bonus.html" },
  { _id: 9, title: "Leave", path: "/public/Admin-Dashboard/leave.html" },
  { _id: 10, title: "Staff Accommodation", path: "/public/Admin-Dashboard/rent.html" },
  { _id: 11, title: "Staff GrossAmount", path: "/public/Admin-Dashboard/gross-amount-dashboard.html" },
  { _id: 12, title: "Vendor Registration", path: "/public/Admin-Dashboard/vendorregistration.html" },
  { _id: 13, title: "Paid Leave", path: "/public/Admin-Dashboard/paidleave.html" },
  { _id: 14, title: "New PO", path: "/public/Admin-Dashboard/newpo.html" },
  { _id: 15, title: "Draft PO", path: "/public/Admin-Dashboard/draftpo.html" },
  { _id: 16, title: "PO History", path: "/public/Admin-Dashboard/pohistory.html" }
];

/* ----------------------------------------------------
   ROLE DETECTION
---------------------------------------------------- */

const urlParams = new URLSearchParams(window.location.search);
const roleFromUrl = urlParams.get("role");
const roleFromStorage = localStorage.getItem("role");
const currentPathLower = window.location.pathname.toLowerCase();

let roleFromPath = "";

if (currentPathLower.includes("/admin-dashboard/")) {
  roleFromPath = "Admin";
} else if (currentPathLower.includes("/hr-dashboard/")) {
  roleFromPath = "HR";
} else if (currentPathLower.includes("/supervisor-dashboard/")) {
  roleFromPath = "Supervisor";
} else if (currentPathLower.includes("/as-dashboard/")) {
  roleFromPath = "AS";
} else if (currentPathLower.includes("/si-dashboard/")) {
  roleFromPath = "Site-Incharge";
} else if (currentPathLower.includes("/employee-dashboard/")) {
  roleFromPath = "Employee";
}

const role = roleFromUrl || roleFromPath || roleFromStorage || "Employee";
localStorage.setItem("role", role);

/* ----------------------------------------------------
   USER EMAIL INTENT
---------------------------------------------------- */

let userEmailIntent = "";

if (role === "Employee") {
  userEmailIntent = localStorage.getItem("employeeEmail") || "";
} else if (role === "Supervisor") {
  userEmailIntent = localStorage.getItem("supEmail") || "";
} else if (role === "AS") {
  userEmailIntent = localStorage.getItem("asEmail") || "";
} else if (role === "HR") {
  userEmailIntent = localStorage.getItem("hrEmail") || "";
} else if (role === "Site-Incharge") {
  userEmailIntent = localStorage.getItem("siEmail") || "";
} else if (role === "Admin") {
  userEmailIntent = localStorage.getItem("adminEmail") || "";
}

if (userEmailIntent) {
  console.log(`Logged in ${role} Email: ${userEmailIntent}`);
}

/* ----------------------------------------------------
   DOM REFERENCES
---------------------------------------------------- */

const SideBar = document.getElementById("side-bar");

const HomeAnchor =
  document.querySelector(".header > a") ||
  document.querySelector(".topbar .brand-title") ||
  document.querySelector("header a");

/* ----------------------------------------------------
   HELPERS
---------------------------------------------------- */

function getHomePathByRole(roleName) {
  switch (roleName) {
    case "Employee":
      return "EmployeeHome.html";
    case "Supervisor":
      return "SupervisorHome.html";
    case "AS":
      return "AsHome.html";
    case "Admin":
      return "AdminHome.html";
    case "Site-Incharge":
      return "SiHome.html";
    case "HR":
      return "Hrhome.html";
    default:
      return "#";
  }
}

function getOptionsByRole(roleName) {
  switch (roleName) {
    case "Supervisor":
      return SupervisorOptions;
    case "AS":
      return ASOptions;
    case "Employee":
      return EmployeeOptions;
    case "Admin":
      return AdminOptions;
    case "Site-Incharge":
      return SiOptions;
    case "HR":
      return HROptions;
    default:
      return [];
  }
}

function normalizeValue(value) {
  return String(value || "").trim().toLowerCase();
}

function uniqueArray(items) {
  return [...new Set((items || []).filter(Boolean))];
}

function getJobListFromData(data) {
  if (!data) return [];

  const candidateKeys = ["jobs", "job", "department", "departments", "site", "sites"];

  for (const key of candidateKeys) {
    const value = data[key];

    if (Array.isArray(value)) {
      return uniqueArray(value.map(v => String(v).trim()).filter(Boolean));
    }

    if (typeof value === "string" && value.trim()) {
      return [value.trim()];
    }
  }

  return [];
}

function parseYMD(ymd) {
  if (!ymd || typeof ymd !== "string") {
    return new Date(NaN);
  }

  const parts = ymd.split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    return new Date(NaN);
  }

  const [y, m, d] = parts;
  return new Date(y, m - 1, d, 0, 0, 0);
}

function isDateValid(dateObj) {
  return dateObj instanceof Date && !Number.isNaN(dateObj.getTime());
}

function setLocalJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getLocalJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function toggleLinks(aNodeList, disable) {
  aNodeList.forEach(a => {
    if (disable) {
      a.classList.add("disabled-link");
    } else {
      a.classList.remove("disabled-link");
    }
  });
}

async function getDocDataByEmail(collectionName, email) {
  if (!email) return null;

  try {
    const snap = await getDoc(doc(db, collectionName, email));
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    console.error(`[getDocDataByEmail] ${collectionName}`, err);
    return null;
  }
}

async function getSupervisorLeaveStatusByUid(supUid) {
  if (!supUid) {
    return { onLeave: false, matchedLeaves: [] };
  }

  try {
    const supLeaveCol = collection(db, "Leave", supUid, "Supervisor");
    const leaveSnaps = await getDocs(supLeaveCol);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const matchedLeaves = [];

    for (const docSnap of leaveSnaps.docs) {
      const data = docSnap.data();
      if (data.Status !== "Approved") continue;

      const start = parseYMD(data.startDate);
      const end = parseYMD(data.endDate);

      if (!isDateValid(start) || !isDateValid(end)) continue;

      if (today >= start && today <= end) {
        matchedLeaves.push({
          id: docSnap.id,
          startDate: data.startDate || "",
          endDate: data.endDate || "",
          reason: data.reason || "",
          status: data.Status || "Approved"
        });
      }
    }

    return {
      onLeave: matchedLeaves.length > 0,
      matchedLeaves
    };
  } catch (err) {
    console.error("[getSupervisorLeaveStatusByUid] error:", err);
    return { onLeave: false, matchedLeaves: [] };
  }
}

async function findSupervisorsForJobs(jobList) {
  const normalizedJobs = uniqueArray(
    (jobList || [])
      .map(job => String(job).trim())
      .filter(Boolean)
  );

  if (!normalizedJobs.length) return [];

  try {
    const results = [];
    const seen = new Set();

    for (const job of normalizedJobs) {
      const supQ = query(
        collection(db, "Supervisor"),
        where("jobs", "array-contains", job)
      );

      const supSnap = await getDocs(supQ);

      supSnap.docs.forEach(d => {
        const data = d.data();
        const uid = data.uid || d.id;
        const key = String(uid || d.id);

        if (seen.has(key)) return;
        seen.add(key);

        results.push({
          uid: uid || d.id,
          email: d.id,
          name: data.name || data.fullName || data.supervisorName || "",
          jobs: getJobListFromData(data)
        });
      });
    }

    return results;
  } catch (err) {
    console.error("[findSupervisorsForJobs] error:", err);
    return [];
  }
}

async function buildASAccessScope(asEmail) {
  if (!asEmail) {
    return {
      asEmail: "",
      asJobs: [],
      activeDepartments: [],
      activeSupervisors: [],
      activeSupervisorUids: []
    };
  }

  try {
    const asData = await getDocDataByEmail("AS", asEmail);
    if (!asData) {
      return {
        asEmail,
        asJobs: [],
        activeDepartments: [],
        activeSupervisors: [],
        activeSupervisorUids: []
      };
    }

    const asJobs = getJobListFromData(asData);
    const supervisors = await findSupervisorsForJobs(asJobs);

    const activeDepartments = [];
    const activeSupervisors = [];
    const activeSupervisorUids = [];

    for (const sup of supervisors) {
      const leaveInfo = await getSupervisorLeaveStatusByUid(sup.uid);
      if (!leaveInfo.onLeave) continue;

      const supJobs = getJobListFromData(sup);
      const matchJobs = supJobs.length
        ? supJobs
        : asJobs.filter(job => {
            const n1 = normalizeValue(job);
            return n1 && sup.jobs.some(sj => normalizeValue(sj) === n1);
          });

      const departmentsToAdd = matchJobs.length ? matchJobs : asJobs;

      departmentsToAdd.forEach(dep => {
        if (dep && !activeDepartments.includes(dep)) {
          activeDepartments.push(dep);
        }
      });

      activeSupervisors.push({
        uid: sup.uid,
        email: sup.email,
        name: sup.name,
        jobs: departmentsToAdd,
        leave: leaveInfo.matchedLeaves
      });

      if (sup.uid && !activeSupervisorUids.includes(sup.uid)) {
        activeSupervisorUids.push(sup.uid);
      }
    }

    return {
      asEmail,
      asJobs,
      activeDepartments,
      activeSupervisors,
      activeSupervisorUids
    };
  } catch (err) {
    console.error("[buildASAccessScope] error:", err);
    return {
      asEmail,
      asJobs: [],
      activeDepartments: [],
      activeSupervisors: [],
      activeSupervisorUids: []
    };
  }
}

async function buildSupervisorScope(supEmail) {
  if (!supEmail) {
    return {
      supervisorEmail: "",
      supervisorUid: "",
      jobs: [],
      onLeave: false,
      matchedLeaves: []
    };
  }

  try {
    const supData = await getDocDataByEmail("Supervisor", supEmail);
    if (!supData) {
      return {
        supervisorEmail: supEmail,
        supervisorUid: "",
        jobs: [],
        onLeave: false,
        matchedLeaves: []
      };
    }

    const supUid = supData.uid || "";
    const leaveInfo = await getSupervisorLeaveStatusByUid(supUid);

    return {
      supervisorEmail: supEmail,
      supervisorUid: supUid,
      jobs: getJobListFromData(supData),
      onLeave: leaveInfo.onLeave,
      matchedLeaves: leaveInfo.matchedLeaves
    };
  } catch (err) {
    console.error("[buildSupervisorScope] error:", err);
    return {
      supervisorEmail: supEmail,
      supervisorUid: "",
      jobs: [],
      onLeave: false,
      matchedLeaves: []
    };
  }
}

function saveAccessScope(scope) {
  const payload = {
    ...scope,
    updatedAt: new Date().toISOString()
  };

  localStorage.setItem("kieplAccessScope", JSON.stringify(payload));
  localStorage.setItem("kieplActiveDepartments", JSON.stringify(scope.activeDepartments || []));
  localStorage.setItem("kieplActiveSupervisorUids", JSON.stringify(scope.activeSupervisorUids || []));
  localStorage.setItem("kieplActiveSupervisors", JSON.stringify(scope.activeSupervisors || []));
}

async function refreshLeaveAccessScope() {
  try {
    if (role === "AS") {
      const asEmail = localStorage.getItem("asEmail") || "";
      const scope = await buildASAccessScope(asEmail);

      saveAccessScope({
        role: "AS",
        asEmail,
        asJobs: scope.asJobs,
        activeDepartments: scope.activeDepartments,
        activeSupervisors: scope.activeSupervisors,
        activeSupervisorUids: scope.activeSupervisorUids
      });

      return scope;
    }

    if (role === "Supervisor") {
      const supEmail = localStorage.getItem("supEmail") || "";
      const scope = await buildSupervisorScope(supEmail);

      localStorage.setItem(
        "kieplAccessScope",
        JSON.stringify({
          role: "Supervisor",
          supervisorEmail: scope.supervisorEmail,
          supervisorUid: scope.supervisorUid,
          jobs: scope.jobs,
          onLeave: scope.onLeave,
          matchedLeaves: scope.matchedLeaves,
          updatedAt: new Date().toISOString()
        })
      );

      return scope;
    }

    localStorage.setItem(
      "kieplAccessScope",
      JSON.stringify({
        role,
        updatedAt: new Date().toISOString()
      })
    );

    return null;
  } catch (err) {
    console.error("[refreshLeaveAccessScope] error:", err);
    return null;
  }
}

/* ----------------------------------------------------
   SIDEBAR RENDER
---------------------------------------------------- */

const appearOptions = () => {
  if (!SideBar) {
    console.warn("Sidebar element #side-bar not found.");
    return;
  }

  const options = getOptionsByRole(role);
  SideBar.innerHTML = "";

  if (HomeAnchor) {
    HomeAnchor.innerText = `${role} Dashboard`;
    HomeAnchor.href = getHomePathByRole(role);
  }

  if (role === "Supervisor" || role === "AS" || role === "Site-Incharge" || role === "Admin") {
    if (role === "Admin") {
      const adminDropdownItems = [
        "Employee Approval",
        "Staff Accommodation",
        "Staff GrossAmount",
        "Paid Leave"
      ];

      const poManagementItems = [
  "Vendor Registration",
  "New PO",
  "Draft PO",
  "PO History"
];

      const dropdownLi = document.createElement("li");
      const details = document.createElement("details");
      const summary = document.createElement("summary");

      summary.innerHTML = `<strong>Admin Tools</strong>`;
      details.appendChild(summary);

      const dropdownUl = document.createElement("ul");
      dropdownUl.style.cssText = "list-style:none; padding:0; margin:0;";

      options.forEach(option => {
        if (adminDropdownItems.includes(option.title)) {
          const li = document.createElement("li");
          const link = document.createElement("a");
          link.href = option.path;
          link.textContent = option.title;
          li.appendChild(link);
          dropdownUl.appendChild(li);
        }
      });

      details.appendChild(dropdownUl);
      dropdownLi.appendChild(details);
      SideBar.appendChild(dropdownLi);
       
      const poDropdownLi = document.createElement("li");
const poDetails = document.createElement("details");
const poSummary = document.createElement("summary");

poSummary.innerHTML = `<strong>PO Management</strong>`;
poDetails.appendChild(poSummary);

const poDropdownUl = document.createElement("ul");
poDropdownUl.style.cssText =
  "list-style:none; padding:0; margin:0;";

options.forEach(option => {
  if (poManagementItems.includes(option.title)) {
    const li = document.createElement("li");

    const link = document.createElement("a");
    link.href = option.path;
    link.textContent = option.title;

    li.appendChild(link);
    poDropdownUl.appendChild(li);
  }
});

poDetails.appendChild(poDropdownUl);
poDropdownLi.appendChild(poDetails);
SideBar.appendChild(poDropdownLi);

      options.forEach(option => {
  if (
    !adminDropdownItems.includes(option.title) &&
    !poManagementItems.includes(option.title)
  ) {
          const li = document.createElement("li");
          const link = document.createElement("a");
          link.href = option.path;
          link.textContent = option.title;
          li.appendChild(link);
          SideBar.appendChild(li);
        }
      });
    } else {
      const dropdownLi = document.createElement("li");
      const details = document.createElement("details");
      const summary = document.createElement("summary");

      summary.innerHTML = `<strong>${role} Menu</strong>`;
      details.appendChild(summary);

      const roleOptions =
        role === "Supervisor"
          ? SupervisorOptions
          : role === "AS"
          ? ASOptions
          : SiOptions;

      const dropdownUl = document.createElement("ul");
      dropdownUl.style.cssText = "list-style:none; padding:0; margin:0;";

      roleOptions.slice(0, 3).forEach(opt => {
        const li = document.createElement("li");
        const link = document.createElement("a");
        link.href = opt.path;
        link.textContent = opt.title;
        li.appendChild(link);
        dropdownUl.appendChild(li);
      });

      details.appendChild(dropdownUl);
      dropdownLi.appendChild(details);
      SideBar.appendChild(dropdownLi);

      roleOptions.slice(3).forEach(opt => {
        const li = document.createElement("li");
        const link = document.createElement("a");
        link.href = opt.path;
        link.textContent = opt.title;

        if (role === "AS") {
          link.classList.add("disabled-link");
        }

        li.appendChild(link);
        SideBar.appendChild(li);
      });
    }
  } else {
    options.forEach(option => {
      const li = document.createElement("li");
      const link = document.createElement("a");
      link.href = option.path;
      link.textContent = option.title;
      li.appendChild(link);
      SideBar.appendChild(li);
    });
  }
};

appearOptions();

/* ----------------------------------------------------
   SIDEBAR STYLE INJECTION
---------------------------------------------------- */

(function ensureSidebarStyle() {
  if (document.getElementById("sidebar-style-fix")) return;

  const style = document.createElement("style");
  style.id = "sidebar-style-fix";

  style.innerHTML = `
    #side-bar li {
      list-style: none;
      margin-bottom: 4px;
    }

    #side-bar li a {
      display: block;
      padding: 10px 15px;
      text-decoration: none;
      border-radius: 8px;
      transition: background-color 0.3s ease;
    }

    #side-bar li details {
      border-radius: 8px;
      margin-bottom: 5px;
      overflow: hidden;
    }

    #side-bar li details summary {
      cursor: pointer;
      padding: 12px 15px;
      font-size: 16px;
      list-style: none;
      outline: none;
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      border-radius: 10px;
      transition: all 0.3s ease;
    }

    #side-bar li details summary::-webkit-details-marker {
      display: none;
    }

    #side-bar li details summary::after {
      content: "▶️";
      font-size: 12px;
      margin-left: auto;
      transition: transform 0.3s ease;
    }

    #side-bar li details[open] summary::after {
      transform: rotate(90deg);
    }

    #side-bar li details ul {
      list-style: none;
      padding: 0;
      margin: 0;
    }

    #side-bar li details ul li {
      margin-bottom: 2px;
    }

    #side-bar li details ul li a {
      padding-left: 30px;
      font-size: 14px;
      border-radius: 8px;
    }

    .disabled-link {
      color: #888 !important;
      pointer-events: none !important;
      opacity: 0.55 !important;
      text-decoration: none !important;
    }
  `;

  document.head.appendChild(style);
})();

/* ----------------------------------------------------
   LEAVE-BASED MENU LOCK
---------------------------------------------------- */

async function adjustMenuForLeave() {
  if (!SideBar) return;

  const scope = await refreshLeaveAccessScope();

  if (role === "Supervisor") {
    const supLinks = document.querySelectorAll(
      '#side-bar > li > a[href^="/public/Supervisor-Dashboard/"]'
    );

    const shouldDisable = !!scope?.onLeave;
    toggleLinks(supLinks, shouldDisable);
    return;
  }

  if (role === "AS") {
    const asLinks = document.querySelectorAll(
      '#side-bar > li > a[href^="/public/AS-Dashboard/"]'
    );

    const activeDepartments = scope?.activeDepartments || [];
    toggleLinks(asLinks, activeDepartments.length === 0);
    return;
  }

  if (role === "Site-Incharge") {
    return;
  }
}

adjustMenuForLeave();

setInterval(() => {
  adjustMenuForLeave();
}, 5 * 60 * 1000);

/* ----------------------------------------------------
   LOGOUT FUNCTION
---------------------------------------------------- */

window.logoutUser = function () {
  secureLogout("Logged out successfully");
};
