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

// Initialize Firebase (will be called after DOM loads)
let database;
function initializeFirebase() {
  try {
    if (typeof firebase === 'undefined') {
      console.warn('Firebase SDK not loaded');
      return;
    }
    
    // Check if already initialized
    try {
      firebase.app();
      database = firebase.database();
    } catch (e) {
      // Not initialized, so initialize it
      firebase.initializeApp(firebaseConfig);
      database = firebase.database();
    }
  } catch (error) {
    console.error('Firebase initialization error:', error);
  }
}

// Application State
let state = {
  phase: 'focus', // 'focus' or 'break'
  isRunning: false,
  startTime: null,
  initialRemainingTime: 50 * 60, // Time remaining when timer started (in seconds)
  remainingTime: 50 * 60, // Current remaining time (in seconds)
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
const TIMER_TICK = 100; // Update timer every 100ms for smooth display

// DOM Elements (will be initialized after DOM loads)
let timerEl, phaseLabelEl, cycleCountEl, startPauseBtn, skipBreakBtn, takeBreakBtn;
let resumeFocusBtn, resetBtn, settingsBtn, settingsPanel, saveSettingsBtn;
let closeSettingsBtn, accumulatedTimeEl, focusTimeInput, breakTimeInput;
let longBreakTimeInput, longBreakIntervalInput;

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', function() {
  // Initialize Firebase first
  initializeFirebase();
  
  // Initialize DOM Elements
  timerEl = document.getElementById('timer');
  phaseLabelEl = document.getElementById('phase-label');
  cycleCountEl = document.getElementById('cycle-count');
  startPauseBtn = document.getElementById('start-pause-btn');
  skipBreakBtn = document.getElementById('skip-break-btn');
  takeBreakBtn = document.getElementById('take-break-btn');
  resumeFocusBtn = document.getElementById('resume-focus-btn');
  resetBtn = document.getElementById('reset-btn');
  settingsBtn = document.getElementById('settings-btn');
  settingsPanel = document.getElementById('settings-panel');
  saveSettingsBtn = document.getElementById('save-settings-btn');
  closeSettingsBtn = document.getElementById('close-settings-btn');
  accumulatedTimeEl = document.getElementById('accumulated-time');
  focusTimeInput = document.getElementById('focus-time');
  breakTimeInput = document.getElementById('break-time');
  longBreakTimeInput = document.getElementById('long-break-time');
  longBreakIntervalInput = document.getElementById('long-break-interval');

  // Initialize app
  init();
});

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

// Helper function to set remaining time (updates both remainingTime and initialRemainingTime)
function setRemainingTime(seconds) {
  state.remainingTime = seconds;
  state.initialRemainingTime = seconds;
}

function setupFirebaseListeners() {
  if (!database) {
    console.warn('Firebase database not available, running in local-only mode');
    return;
  }
  
  const timerRef = database.ref('timer');
  
  timerRef.on('value', (snapshot) => {
    const data = snapshot.val();
    if (data) {
      // Only sync if data is from another device (not our own update)
      const wasRunning = state.isRunning;
      
      // Calculate remaining time based on server time to prevent clock drift
      const serverTime = data.serverTime || Date.now();
      const now = Date.now();
      const timeDiff = now - serverTime;
      
      if (data.isRunning && data.startTime && data.remainingTimeAtStart !== null) {
        // Calculate elapsed time accounting for server time offset
        const elapsed = Math.floor((now - data.startTime - timeDiff) / 1000);
        const calculatedRemaining = Math.max(0, data.remainingTimeAtStart - elapsed);
        
        // Only update if the remote state is more recent or if we're not running locally
        if (!wasRunning || Math.abs(calculatedRemaining - state.remainingTime) > 2) {
          state.remainingTime = calculatedRemaining;
          state.initialRemainingTime = data.remainingTimeAtStart;
          state.startTime = data.startTime;
        }
      } else if (!data.isRunning) {
        // If remote is paused, use the stored remaining time
        setRemainingTime(data.remainingTime || state.remainingTime);
      }
      
      // Sync other state properties
      state.phase = data.phase !== undefined ? data.phase : state.phase;
      state.isRunning = data.isRunning !== undefined ? data.isRunning : state.isRunning;
      state.cycleCount = data.cycleCount !== undefined ? data.cycleCount : state.cycleCount;
      state.accumulatedBreakTime = data.accumulatedBreakTime !== undefined ? data.accumulatedBreakTime : state.accumulatedBreakTime;
      state.isInAccumulatedBreak = data.isInAccumulatedBreak !== undefined ? data.isInAccumulatedBreak : state.isInAccumulatedBreak;
      state.accumulatedBreakRemaining = data.accumulatedBreakRemaining !== undefined ? data.accumulatedBreakRemaining : state.accumulatedBreakRemaining;
      state.savedFocusTime = data.savedFocusTime !== undefined ? data.savedFocusTime : state.savedFocusTime;
      
      if (data.settings) {
        state.settings = { ...state.settings, ...data.settings };
      }
      
      // Update timer intervals based on running state
      if (state.isRunning && !wasRunning) {
        // Timer was started remotely
        if (!timerInterval) {
          timerInterval = setInterval(updateTimer, TIMER_TICK);
        }
        if (!syncInterval) {
          syncInterval = setInterval(syncToFirebase, SYNC_INTERVAL);
        }
      } else if (!state.isRunning && wasRunning) {
        // Timer was paused remotely
        if (timerInterval) {
          clearInterval(timerInterval);
          timerInterval = null;
        }
        if (syncInterval) {
          clearInterval(syncInterval);
          syncInterval = null;
        }
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
      setRemainingTime(state.settings.focusTime * 60);
    } else {
      setRemainingTime(getBreakTime() * 60);
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
  if (state.isRunning) return;
  
  state.isRunning = true;
  state.startTime = Date.now();
  state.initialRemainingTime = state.remainingTime; // Store current remaining time as initial
  
  syncToFirebase();
  updateUI();
  
  // Clear any existing intervals
  if (timerInterval) clearInterval(timerInterval);
  if (syncInterval) clearInterval(syncInterval);
  
  // Start local timer countdown
  timerInterval = setInterval(updateTimer, TIMER_TICK);
  
  // Sync to Firebase periodically
  syncInterval = setInterval(syncToFirebase, SYNC_INTERVAL);
}

function pauseTimer() {
  state.isRunning = false;
  state.startTime = null;
  state.initialRemainingTime = state.remainingTime; // Update initial to current when pausing
  
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
  if (!state.isRunning || !state.startTime) return;
  
  // Calculate elapsed time since start
  const now = Date.now();
  const elapsed = Math.floor((now - state.startTime) / 1000);
  
  // Update remaining time based on initial time minus elapsed
  state.remainingTime = Math.max(0, state.initialRemainingTime - elapsed);
  
  // Check if timer reached zero
  if (state.remainingTime <= 0) {
    handlePhaseComplete();
  } else {
    updateUI();
  }
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
    setRemainingTime(breakTime * 60);
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
      setRemainingTime(state.savedFocusTime || state.settings.focusTime * 60);
      state.isInAccumulatedBreak = false;
      state.accumulatedBreakTime = 0; // All accumulated time was used
      state.savedFocusTime = null;
    } else {
      // Regular break completed, start new focus
      playNotificationSound();
      showNotification('Break Complete!', 'Time to focus.');
      
      state.phase = 'focus';
      setRemainingTime(state.settings.focusTime * 60);
      
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
  setRemainingTime(state.settings.focusTime * 60);
  
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
  setRemainingTime(state.accumulatedBreakTime);
  
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
  setRemainingTime(state.savedFocusTime || state.settings.focusTime * 60);
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
  setRemainingTime(state.settings.focusTime * 60);
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
  if (!database) return;
  
  try {
    const timerRef = database.ref('timer');
    
    // Calculate remaining time at start for accurate sync
    let remainingTimeAtStart = state.remainingTime;
    if (state.isRunning && state.startTime) {
      const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
      remainingTimeAtStart = state.remainingTime + elapsed;
    }
    
    const data = {
      phase: state.phase,
      isRunning: state.isRunning,
      remainingTime: state.remainingTime,
      remainingTimeAtStart: state.isRunning ? remainingTimeAtStart : state.remainingTime,
      startTime: state.isRunning ? (state.startTime || Date.now()) : null,
      cycleCount: state.cycleCount,
      accumulatedBreakTime: state.accumulatedBreakTime,
      isInAccumulatedBreak: state.isInAccumulatedBreak,
      accumulatedBreakRemaining: state.accumulatedBreakRemaining,
      savedFocusTime: state.savedFocusTime,
      settings: state.settings,
      serverTime: Date.now()
    };
    
    timerRef.set(data).catch(error => {
      console.error('Firebase sync error:', error);
    });
  } catch (error) {
    console.error('Firebase sync error:', error);
  }
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

