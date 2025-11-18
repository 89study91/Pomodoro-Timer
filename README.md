# Pomodoro Sync - Multi-Device Synchronized Timer

A multi-device Pomodoro timer that synchronizes across all devices using Firebase Realtime Database. Built with pure HTML, CSS, and JavaScript.

## Features

- **Multi-Device Synchronization**: Timer state is synchronized across all devices using Firebase server time to prevent clock drift
- **Default Times**: 50 minutes Focus / 10 minutes Break / 30 minutes Long Break (after 4 cycles)
- **Auto-Start**: Automatically starts breaks and focus cycles
- **Break Accumulation**: 
  - Skip breaks to accumulate time
  - Take accumulated breaks during focus sessions
  - Resume focus with remaining time if accumulated break is interrupted
- **Settings Panel**: Customize Focus, Break, Long Break times, and Long Break interval
- **Notifications & Sound**: Browser notifications and sound alerts on phase changes
- **Reset Functionality**: Reset timer to initial state

## Usage

1. Open `index.html` in a web browser
2. Allow notifications when prompted
3. Click "Start" to begin the timer
4. The timer will automatically transition between Focus and Break phases
5. Use "Skip Break" to accumulate break time
6. Use "Take Accumulated Break" during focus to use accumulated time
7. Use "Resume Focus" to return to focus from an accumulated break
8. Use "Settings" to customize timer durations
9. Use "Reset" to restart the timer

## Technical Details

- **Firebase Realtime Database**: Used for real-time synchronization
- **Server Time Sync**: Uses Firebase server timestamps to prevent clock drift across devices
- **Local Storage**: Settings are saved locally for persistence
- **Web Audio API**: Generates notification sounds
- **Browser Notifications API**: Shows desktop notifications on phase changes

## Requirements

- Modern web browser with JavaScript enabled
- Internet connection for Firebase synchronization
- Notification permission for desktop alerts

