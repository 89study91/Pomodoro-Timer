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
  phaseDuration: 50 * 60, // Total duration for current phase (in seconds)
  totalElapsedTime: 0, // Total elapsed time across all start/pause cycles (in seconds)
  remainingTime: 50 * 60, // Current remaining time (in seconds) = phaseDuration - totalElapsedTime
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
const TIMER_TICK = 100; // Update timer every 100ms for smooth display

// Generate unique device ID for this session
const deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

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

// Helper function to set phase duration and reset elapsed time
function setPhaseDuration(seconds) {
  const duration = Number(seconds) || 0;
  state.phaseDuration = duration;
  state.totalElapsedTime = 0;
  state.remainingTime = duration;
}

// Helper function to update remaining time from phase duration and elapsed time
function updateRemainingTime() {
  const phaseDuration = Number(state.phaseDuration) || 0;
  const totalElapsed = Number(state.totalElapsedTime) || 0;
  state.remainingTime = Math.max(0, phaseDuration - totalElapsed);
}

// Helper function to safely calculate remaining time
function calculateRemainingTime(phaseDuration, totalElapsedTime, currentElapsed) {
  const duration = Number(phaseDuration) || 0;
  const totalElapsed = (Number(totalElapsedTime) || 0) + (Number(currentElapsed) || 0);
  return Math.max(0, duration - totalElapsed);
}

function setupFirebaseListeners() {
  if (!database) {
    console.warn('Firebase database not available, running in local-only mode');
    return;
  }
  
  const timerRef = database.ref('timer');
  
  timerRef.on('value', (snapshot) => {
    const data = snapshot.val();
    if (!data) return;
    
    const wasRunning = state.isRunning;
    const now = Date.now();
    
    // CRITICAL FIX: Removed serverTime and timeDiff - they cause time drift
    // We rely ONLY on startTime (ServerValue.TIMESTAMP) for all time calculations
    
    // CRITICAL FIX: Use phaseDuration and totalElapsedTime for accurate calculation
    // Update phaseDuration and totalElapsedTime from Firebase with NaN protection
    if (data.phaseDuration !== undefined && !isNaN(data.phaseDuration)) {
      state.phaseDuration = Number(data.phaseDuration);
    }
    if (data.totalElapsedTime !== undefined && !isNaN(data.totalElapsedTime)) {
      state.totalElapsedTime = Number(data.totalElapsedTime);
    }
    
    // Ensure phaseDuration and totalElapsedTime are valid numbers
    if (isNaN(state.phaseDuration) || state.phaseDuration <= 0) {
      // Default to focus time if invalid
      state.phaseDuration = state.settings.focusTime * 60;
    }
    if (isNaN(state.totalElapsedTime) || state.totalElapsedTime < 0) {
      state.totalElapsedTime = 0;
    }
    
    if (data.isRunning && data.startTime) {
      // CRITICAL FIX: Calculate elapsed time using server timestamp
      // Firebase ServerValue.TIMESTAMP is resolved by the server to a number
      let startTimeMs = data.startTime;
      if (typeof startTimeMs === 'object' && startTimeMs !== null) {
        // ServerValue.TIMESTAMP placeholder - wait for it to resolve
        return;
      } else if (typeof startTimeMs !== 'number' || isNaN(startTimeMs)) {
        return;
      }
      
      // CRITICAL FIX: Calculate remaining time correctly with NaN protection
      // remaining = phaseDuration - (totalElapsedTime + currentElapsed)
      const currentElapsed = Math.floor((now - startTimeMs) / 1000);
      const calculatedRemaining = calculateRemainingTime(
        state.phaseDuration,
        state.totalElapsedTime,
        currentElapsed
      );
      
      // Update state from authoritative source (Firebase) - ALL devices are passive listeners
      // This includes the device that wrote the change
      state.remainingTime = calculatedRemaining;
      state.startTime = startTimeMs;
      state.isRunning = true;
    } else if (!data.isRunning) {
      // If remote is paused, use the stored values
      // remainingTime = phaseDuration - totalElapsedTime (already calculated)
      if (data.remainingTime !== undefined && !isNaN(data.remainingTime)) {
        state.remainingTime = Number(data.remainingTime);
      } else {
        updateRemainingTime();
      }
      state.isRunning = false;
      state.startTime = null;
    }
    
    // Sync other state properties from authoritative source
    state.phase = data.phase !== undefined ? data.phase : state.phase;
    state.cycleCount = data.cycleCount !== undefined ? data.cycleCount : state.cycleCount;
    state.accumulatedBreakTime = data.accumulatedBreakTime !== undefined ? data.accumulatedBreakTime : state.accumulatedBreakTime;
    state.isInAccumulatedBreak = data.isInAccumulatedBreak !== undefined ? data.isInAccumulatedBreak : state.isInAccumulatedBreak;
    state.accumulatedBreakRemaining = data.accumulatedBreakRemaining !== undefined ? data.accumulatedBreakRemaining : state.accumulatedBreakRemaining;
    state.savedFocusTime = data.savedFocusTime !== undefined ? data.savedFocusTime : state.savedFocusTime;
    
    if (data.settings) {
      state.settings = { ...state.settings, ...data.settings };
    }
    
    // Update timer intervals based on running state
    // CRITICAL: This must happen for ALL devices, including the one that wrote the change
    if (state.isRunning && !wasRunning) {
      // Timer was started (by us or remotely) - start local countdown for UI
      if (!timerInterval) {
        timerInterval = setInterval(updateTimer, TIMER_TICK);
      }
    } else if (!state.isRunning && wasRunning) {
      // Timer was paused (by us or remotely) - stop local countdown
      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
    }
    
    // CRITICAL: Always update UI from Firebase state
    // This ensures the initiating device also updates when it receives its own write confirmation
    // This fixes the "asymmetric freezing" bug where the writing device doesn't update
    updateUI();
    
    // Check if timer reached zero
    if (state.remainingTime <= 0 && state.isRunning) {
      handlePhaseComplete();
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
  writeStateToFirebase();
  settingsPanel.style.display = 'none';
  
  // If timer is not running, update the display
  if (!state.isRunning) {
    if (state.phase === 'focus') {
      setPhaseDuration(state.settings.focusTime * 60);
    } else {
      setPhaseDuration(getBreakTime() * 60);
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
  
  // CRITICAL FIX: When starting/resuming, we use phaseDuration and totalElapsedTime
  // remainingTime = phaseDuration - totalElapsedTime (calculated correctly)
  // We don't change totalElapsedTime here - it only increases when we pause
  state.isRunning = true;
  // startTime will be set by Firebase ServerValue.TIMESTAMP when we write
  
  // Clear any existing intervals
  if (timerInterval) clearInterval(timerInterval);
  
  // Write to Firebase with ServerValue.TIMESTAMP for accurate server time
  // ONLY the authoritative device writes to Firebase
  writeStateToFirebase();
  
  // Don't update UI here - wait for Firebase listener to confirm and update
  // This ensures all devices (including this one) get the correct server timestamp
}

function pauseTimer() {
  // CRITICAL FIX: Calculate elapsed time since last start and add to totalElapsedTime
  // When pausing: totalElapsedTime += elapsed, remainingTime = phaseDuration - totalElapsedTime
  if (state.isRunning && state.startTime) {
    const now = Date.now();
    const elapsed = Math.floor((now - state.startTime) / 1000);
    // Ensure totalElapsedTime is a valid number
    const currentTotal = Number(state.totalElapsedTime) || 0;
    state.totalElapsedTime = currentTotal + elapsed;
    // Update remaining time: remaining = phaseDuration - totalElapsedTime
    updateRemainingTime();
  }
  
  state.isRunning = false;
  state.startTime = null;
  
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  
  // Write to Firebase - ONLY the authoritative device writes
  // Write phaseDuration, totalElapsedTime, and calculated remainingTime
  writeStateToFirebase();
  
  updateUI();
}

function updateTimer() {
  if (!state.isRunning || !state.startTime) return;
  
  // CRITICAL: Local timer is only for UI updates
  // The authoritative time comes from Firebase listener calculations
  // Calculate: remaining = phaseDuration - (totalElapsedTime + currentElapsed)
  const now = Date.now();
  const currentElapsed = Math.floor((now - state.startTime) / 1000);
  const calculatedRemaining = calculateRemainingTime(
    state.phaseDuration,
    state.totalElapsedTime,
    currentElapsed
  );
  
  // Only update if it's a reasonable value (Firebase listener will correct if needed)
  if (!isNaN(calculatedRemaining) && calculatedRemaining >= 0 && calculatedRemaining <= state.phaseDuration) {
    state.remainingTime = calculatedRemaining;
  }
  
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
    setPhaseDuration(breakTime * 60);
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
      setPhaseDuration(state.savedFocusTime || state.settings.focusTime * 60);
      state.isInAccumulatedBreak = false;
      state.accumulatedBreakTime = 0; // All accumulated time was used
      state.savedFocusTime = null;
    } else {
      // Regular break completed, start new focus
      playNotificationSound();
      showNotification('Break Complete!', 'Time to focus.');
      
      state.phase = 'focus';
      setPhaseDuration(state.settings.focusTime * 60);
      
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
  
  // handlePhaseComplete is called from updateTimer, so we're already authoritative
  // Just write the state change
  writeStateToFirebase();
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
  setPhaseDuration(state.settings.focusTime * 60);
  
  // skipBreak calls pauseTimer which marks us as authoritative
  writeStateToFirebase();
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
  setPhaseDuration(state.accumulatedBreakTime);
  
  // takeAccumulatedBreak calls pauseTimer which marks us as authoritative
  writeStateToFirebase();
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
  setPhaseDuration(state.savedFocusTime || state.settings.focusTime * 60);
  state.savedFocusTime = null;
  
  // resumeFocus calls pauseTimer which marks us as authoritative
  writeStateToFirebase();
  updateUI();
  
  // Auto-start focus
  setTimeout(() => {
    startTimer();
  }, 500);
}

function resetTimer() {
  // CRITICAL FIX: Stop any running timer first
  if (state.isRunning) {
    pauseTimer();
  } else {
    // If not running, still clear intervals and reset state
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    state.isRunning = false;
    state.startTime = null;
  }
  
  // CRITICAL FIX: Reset all state to clean initial values
  state.phase = 'focus';
  state.cycleCount = 1;
  state.accumulatedBreakTime = 0;
  state.isInAccumulatedBreak = false;
  state.accumulatedBreakRemaining = 0;
  state.savedFocusTime = null;
  
  // CRITICAL FIX: Set phaseDuration and reset totalElapsedTime to 0
  // This ensures a clean reset state before any subsequent start
  state.phaseDuration = state.settings.focusTime * 60;
  state.totalElapsedTime = 0;
  state.remainingTime = state.phaseDuration;
  
  // Write clean reset state to Firebase
  writeStateToFirebase();
  updateUI();
}

function getBreakTime() {
  // This function is not currently used, but kept for potential future use
  // Long break occurs when cycleCount is a multiple of longBreakInterval
  const isLongBreak = state.cycleCount % state.settings.longBreakInterval === 0;
  return isLongBreak ? state.settings.longBreakTime : state.settings.breakTime;
}

// Write state to Firebase - ONLY called by authoritative device on state changes
function writeStateToFirebase() {
  if (!database) return;
  
  try {
    const timerRef = database.ref('timer');
    
    // CRITICAL FIX: Write phaseDuration and totalElapsedTime
    // remainingTime is calculated as: phaseDuration - totalElapsedTime (when paused)
    // or: phaseDuration - (totalElapsedTime + currentElapsed) (when running)
    // We write the base values so all devices can calculate correctly
    
    // CRITICAL: Ensure all numeric values are valid numbers before writing
    const phaseDuration = Number(state.phaseDuration) || (state.settings.focusTime * 60);
    const totalElapsedTime = Number(state.totalElapsedTime) || 0;
    const remainingTime = Number(state.remainingTime) || phaseDuration;
    
    const data = {
      phase: state.phase,
      isRunning: state.isRunning,
      phaseDuration: phaseDuration, // Total duration for current phase (always a number)
      totalElapsedTime: totalElapsedTime, // Total elapsed across all cycles (always a number)
      remainingTime: remainingTime, // Current remaining (for paused state, always a number)
      // Use Firebase ServerValue.TIMESTAMP for accurate server time when starting
      startTime: state.isRunning ? firebase.database.ServerValue.TIMESTAMP : null,
      cycleCount: state.cycleCount,
      accumulatedBreakTime: state.accumulatedBreakTime,
      isInAccumulatedBreak: state.isInAccumulatedBreak,
      accumulatedBreakRemaining: state.accumulatedBreakRemaining,
      savedFocusTime: state.savedFocusTime,
      settings: state.settings,
      authorDevice: deviceId, // Track which device made this change
      // REMOVED: serverTime - causes time drift, we use ServerValue.TIMESTAMP only
    };
    
    timerRef.set(data).catch(error => {
      console.error('Firebase write error:', error);
    });
  } catch (error) {
    console.error('Firebase write error:', error);
  }
}

function updateUI() {
  // Update timer display with NaN protection
  const remaining = Number(state.remainingTime) || 0;
  if (isNaN(remaining) || remaining < 0) {
    timerEl.textContent = '00:00';
    return;
  }
  
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
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

