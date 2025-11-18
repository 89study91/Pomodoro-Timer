// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyB91A11J55B1NYAzEDYpMst1zli6Z-uuj4",
  authDomain: "pomodorosync-7f342.firebaseapp.com",
  databaseURL: "https://pomodorosync-7f342-default-rtdb.firebaseio.com",
  projectId: "pomodorosync-7f342",
  storageBucket: "pomodorosync-7f342.firebasestorage.app",
  messagingSenderId: "523175871116",
  appId: "1:523175871116:web:5c43cb66e4e01db215b1a9"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// Application State
let state = {
  phase: 'focus', // 'focus' or 'break'
  isRunning: false,
  startTime: null,
  remainingTime: 50 * 60, // in seconds
  cycleCount: 1,
  accumulatedBreakTime: 0, // in seconds
  settings: {
    focusTime: 50, // minutes
    breakTime: 10, // minutes
    longBreakTime: 30, // minutes
    longBreakInterval: 4
  },
  isInAccumulatedBreak: false,
  accumulatedBreakStartTime: null,
  accumulatedBreakRemaining: 0,
  savedFocusTime: null // Store focus time when taking accumulated break
};

let timerInterval = null;
let syncInterval = null;
const SYNC_INTERVAL = 1000; // Sync every second

// DOM Elements
const timerEl = document.getElementById('timer');
const phaseLabelEl = document.getElementById('phase-label');
const cycleCountEl = document.getElementById('cycle-count');
const startPauseBtn = document.getElementById('start-pause-btn');
const skipBreakBtn = document.getElementById('skip-break-btn');
const takeBreakBtn = document.getElementById('take-break-btn');
const resumeFocusBtn = document.getElementById('resume-focus-btn');
const resetBtn = document.getElementById('reset-btn');
const settingsBtn = document.getElementById('settings-btn');
const settingsPanel = document.getElementById('settings-panel');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const accumulatedTimeEl = document.getElementById('accumulated-time');

// Settings inputs
const focusTimeInput = document.getElementById('focus-time');
const breakTimeInput = document.getElementById('break-time');
const longBreakTimeInput = document.getElementById('long-break-time');
const longBreakIntervalInput = document.getElementById('long-break-interval');

// Initialize
init();

function init() {
  // Request notification permission
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  // Load settings from localStorage
  loadSettings();

  // Set up Firebase listeners
  setupFirebaseListeners();

  // Set up event listeners
  setupEventListeners();

  // Initialize UI
  updateUI();
}

function loadSettings() {
  const saved = localStorage.getItem('pomodoroSettings');
  if (saved) {
    state.settings = JSON.parse(saved);
    focusTimeInput.value = state.settings.focusTime;
    breakTimeInput.value = state.settings.breakTime;
    longBreakTimeInput.value = state.settings.longBreakTime;
    longBreakIntervalInput.value = state.settings.longBreakInterval;
  }
}

function saveSettings() {
  localStorage.setItem('pomodoroSettings', JSON.stringify(state.settings));
}

function setupFirebaseListeners() {
  const timerRef = database.ref('timer');
  
  timerRef.on('value', (snapshot) => {
    const data = snapshot.val();
    if (data) {
      // Calculate remaining time based on server time to prevent clock drift
      const serverTime = data.serverTime || Date.now();
      const now = Date.now();
      const timeDiff = now - serverTime;
      
      if (data.isRunning && data.startTime) {
        // Calculate elapsed time accounting for server time offset
        const elapsed = Math.floor((now - data.startTime - timeDiff) / 1000);
        state.remainingTime = Math.max(0, data.remainingTimeAtStart - elapsed);
      } else {
        state.remainingTime = data.remainingTime || state.remainingTime;
      }
      
      state.phase = data.phase || state.phase;
      state.isRunning = data.isRunning || false;
      state.cycleCount = data.cycleCount || state.cycleCount;
      state.accumulatedBreakTime = data.accumulatedBreakTime || 0;
      state.isInAccumulatedBreak = data.isInAccumulatedBreak || false;
      state.accumulatedBreakRemaining = data.accumulatedBreakRemaining || 0;
      state.savedFocusTime = data.savedFocusTime || null;
      
      if (data.settings) {
        state.settings = { ...state.settings, ...data.settings };
      }
      
      updateUI();
      
      // Check if timer reached zero
      if (state.remainingTime <= 0 && state.isRunning) {
        handlePhaseComplete();
      }
    }
  });
}

function setupEventListeners() {
  startPauseBtn.addEventListener('click', toggleTimer);
  skipBreakBtn.addEventListener('click', skipBreak);
  takeBreakBtn.addEventListener('click', takeAccumulatedBreak);
  resumeFocusBtn.addEventListener('click', resumeFocus);
  resetBtn.addEventListener('click', resetTimer);
  settingsBtn.addEventListener('click', () => {
    settingsPanel.style.display = settingsPanel.style.display === 'none' ? 'block' : 'none';
  });
  saveSettingsBtn.addEventListener('click', saveSettingsHandler);
  closeSettingsBtn.addEventListener('click', () => {
    settingsPanel.style.display = 'none';
  });
}

function saveSettingsHandler() {
  state.settings.focusTime = parseInt(focusTimeInput.value) || 50;
  state.settings.breakTime = parseInt(breakTimeInput.value) || 10;
  state.settings.longBreakTime = parseInt(longBreakTimeInput.value) || 30;
  state.settings.longBreakInterval = parseInt(longBreakIntervalInput.value) || 4;
  
  saveSettings();
  syncToFirebase();
  settingsPanel.style.display = 'none';
  
  // If timer is not running, update the display
  if (!state.isRunning) {
    if (state.phase === 'focus') {
      state.remainingTime = state.settings.focusTime * 60;
    } else {
      state.remainingTime = getBreakTime() * 60;
    }
    updateUI();
  }
}

function toggleTimer() {
  if (state.isRunning) {
    pauseTimer();
  } else {
    startTimer();
  }
}

function startTimer() {
  state.isRunning = true;
  state.startTime = Date.now();
  
  syncToFirebase();
  updateUI();
  
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(updateTimer, 100);
  
  if (syncInterval) clearInterval(syncInterval);
  syncInterval = setInterval(syncToFirebase, SYNC_INTERVAL);
}

function pauseTimer() {
  state.isRunning = false;
  state.startTime = null;
  
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
  
  syncToFirebase();
  updateUI();
}

function updateTimer() {
  if (!state.isRunning) return;
  
  // Timer updates are primarily handled by Firebase sync
  // This local update is just for immediate UI feedback
  updateUI();
}

function handlePhaseComplete() {
  pauseTimer();
  
  if (state.phase === 'focus') {
    // Focus completed, start break
    playNotificationSound();
    showNotification('Focus Complete!', 'Time for a break.');
    
    // Check if it's time for a long break (before incrementing)
    // Long break occurs when cycleCount is a multiple of longBreakInterval
    const isLongBreak = state.cycleCount % state.settings.longBreakInterval === 0;
    const breakTime = isLongBreak ? state.settings.longBreakTime : state.settings.breakTime;
    
    // Increment cycle count after completing focus
    state.cycleCount++;
    
    state.phase = 'break';
    state.remainingTime = breakTime * 60;
    state.isInAccumulatedBreak = false;
    
    // Auto-start break
    setTimeout(() => {
      startTimer();
    }, 1000);
  } else {
    // Break completed
    if (state.isInAccumulatedBreak) {
      // Accumulated break completed, resume focus with saved time
      playNotificationSound();
      showNotification('Accumulated Break Complete!', 'Resuming focus.');
      
      state.phase = 'focus';
      state.remainingTime = state.savedFocusTime || state.settings.focusTime * 60;
      state.isInAccumulatedBreak = false;
      state.accumulatedBreakTime = 0; // All accumulated time was used
      state.savedFocusTime = null;
    } else {
      // Regular break completed, start new focus
      playNotificationSound();
      showNotification('Break Complete!', 'Time to focus.');
      
      state.phase = 'focus';
      state.remainingTime = state.settings.focusTime * 60;
      
      // Reset cycle count after long break (when cycleCount is a multiple of interval)
      if (state.cycleCount % state.settings.longBreakInterval === 0) {
        state.cycleCount = 1;
      }
    }
    
    // Auto-start focus
    setTimeout(() => {
      startTimer();
    }, 1000);
  }
  
  syncToFirebase();
  updateUI();
}

function skipBreak() {
  if (state.phase !== 'break' || state.isInAccumulatedBreak) return;
  
  pauseTimer();
  
  // Determine break time: if cycleCount is a multiple of interval, it's a long break
  // (because cycleCount was incremented when entering this break)
  const isLongBreak = state.cycleCount % state.settings.longBreakInterval === 0;
  const breakTime = isLongBreak ? state.settings.longBreakTime : state.settings.breakTime;
  
  // Accumulate the break time
  state.accumulatedBreakTime += breakTime * 60;
  
  // Move to next focus (cycleCount already incremented when entering break)
  state.phase = 'focus';
  state.remainingTime = state.settings.focusTime * 60;
  
  syncToFirebase();
  updateUI();
  
  // Auto-start focus
  setTimeout(() => {
    startTimer();
  }, 500);
}

function takeAccumulatedBreak() {
  if (state.phase !== 'focus' || state.accumulatedBreakTime <= 0) return;
  
  pauseTimer();
  
  // Save current focus time to resume later
  state.savedFocusTime = state.remainingTime;
  
  // Start accumulated break
  state.isInAccumulatedBreak = true;
  state.accumulatedBreakRemaining = state.accumulatedBreakTime;
  state.phase = 'break';
  state.remainingTime = state.accumulatedBreakTime;
  
  syncToFirebase();
  updateUI();
  
  // Auto-start accumulated break
  setTimeout(() => {
    startTimer();
  }, 500);
}

function resumeFocus() {
  if (!state.isInAccumulatedBreak || state.phase !== 'break') return;
  
  pauseTimer();
  
  // Re-accumulate remaining break time
  state.accumulatedBreakTime = state.remainingTime;
  state.accumulatedBreakRemaining = state.remainingTime;
  
  // Resume focus with saved time
  state.isInAccumulatedBreak = false;
  state.phase = 'focus';
  state.remainingTime = state.savedFocusTime || state.settings.focusTime * 60;
  state.savedFocusTime = null;
  
  syncToFirebase();
  updateUI();
  
  // Auto-start focus
  setTimeout(() => {
    startTimer();
  }, 500);
}

function resetTimer() {
  pauseTimer();
  
  state.phase = 'focus';
  state.remainingTime = state.settings.focusTime * 60;
  state.cycleCount = 1;
  state.accumulatedBreakTime = 0;
  state.isInAccumulatedBreak = false;
  state.accumulatedBreakRemaining = 0;
  state.savedFocusTime = null;
  
  syncToFirebase();
  updateUI();
}

function getBreakTime() {
  // This function is not currently used, but kept for potential future use
  // Long break occurs when cycleCount is a multiple of longBreakInterval
  const isLongBreak = state.cycleCount % state.settings.longBreakInterval === 0;
  return isLongBreak ? state.settings.longBreakTime : state.settings.breakTime;
}

function syncToFirebase() {
  const timerRef = database.ref('timer');
  
  const data = {
    phase: state.phase,
    isRunning: state.isRunning,
    remainingTime: state.remainingTime,
    remainingTimeAtStart: state.isRunning ? state.remainingTime : null,
    startTime: state.isRunning ? Date.now() : null,
    cycleCount: state.cycleCount,
    accumulatedBreakTime: state.accumulatedBreakTime,
    isInAccumulatedBreak: state.isInAccumulatedBreak,
    accumulatedBreakRemaining: state.accumulatedBreakRemaining,
    savedFocusTime: state.savedFocusTime,
    settings: state.settings,
    serverTime: Date.now()
  };
  
  timerRef.set(data);
}

function updateUI() {
  // Update timer display
  const minutes = Math.floor(state.remainingTime / 60);
  const seconds = state.remainingTime % 60;
  timerEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  
  // Update phase label
  if (state.isInAccumulatedBreak) {
    phaseLabelEl.textContent = 'Accumulated Break';
  } else {
    phaseLabelEl.textContent = state.phase === 'focus' ? 'Focus' : 'Break';
  }
  
  // Update cycle count
  cycleCountEl.textContent = `Cycle ${state.cycleCount} of ${state.settings.longBreakInterval}`;
  
  // Update start/pause button
  startPauseBtn.textContent = state.isRunning ? 'Pause' : 'Start';
  
  // Update control buttons visibility
  skipBreakBtn.style.display = (state.phase === 'break' && !state.isInAccumulatedBreak) ? 'inline-block' : 'none';
  takeBreakBtn.style.display = (state.phase === 'focus' && state.accumulatedBreakTime > 0) ? 'inline-block' : 'none';
  resumeFocusBtn.style.display = (state.isInAccumulatedBreak && state.phase === 'break') ? 'inline-block' : 'none';
  
  // Update accumulated break time
  const accMinutes = Math.floor(state.accumulatedBreakTime / 60);
  const accSeconds = state.accumulatedBreakTime % 60;
  accumulatedTimeEl.textContent = `${String(accMinutes).padStart(2, '0')}:${String(accSeconds).padStart(2, '0')}`;
  
  // Update timer color based on phase
  timerEl.className = state.phase === 'focus' ? 'timer timer-focus' : 'timer timer-break';
}

function playNotificationSound() {
  // Create a simple beep sound using Web Audio API
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  
  oscillator.frequency.value = 800;
  oscillator.type = 'sine';
  
  gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
  
  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + 0.5);
}

function showNotification(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, {
      body: body,
      icon: '🍅',
      badge: '🍅'
    });
  }
}

