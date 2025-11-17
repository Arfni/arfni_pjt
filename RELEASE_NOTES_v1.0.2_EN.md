# Arfni v1.0.2 Release Notes

**Release Date:** 2025-01-XX

v1.0.2 is a feature release that adds server availability monitoring capabilities.

---

## New Features

### Server Availability Monitoring

Server availability (uptime) monitoring has been added to the optimization analysis. This feature utilizes Prometheus's `up` metric to analyze server online/offline status and downtime history.

**Key Features**

- **Real-time server status check**: Verifies if the server is currently online through Prometheus
- **24-hour downtime tracking**: Records downtime events over the past 24 hours and calculates total downtime
- **Downtime cause analysis**: Analyzes CPU, memory, and disk metrics immediately before server downtime to estimate the cause
  - Out of Memory (OOM): Memory usage > 95% before downtime
  - CPU overload: CPU usage > 95% before downtime
  - Disk space shortage: Disk usage > 98% before downtime
  - Normal shutdown or network issue: Resource usage within normal range
- **Uptime calculation**: Displays server uptime as a percentage over 24 hours
- **AI recommendations integration**: Server availability information is included when generating OpenAI-based optimization recommendations

**UI Additions**

A "Server Availability" section has been added to the optimization analysis results, displaying:

- Current server status (online/offline)
- 24-hour uptime (percentage)
- Total downtime (minutes)
- Recent downtime events (occurrence time, duration, estimated cause)

**Limitations**

- If the `up` metric is not collected due to Prometheus configuration, only the current server status is checked using the `node_uname_info` metric
- Downtime cause analysis is an estimation based on Prometheus metrics and may differ from actual causes
- System log or application log analysis is not included

---

## Improvements

### JSON Serialization Stability

Improved Go backend to serialize empty slices as empty arrays `[]` instead of `null` in JSON. Added `#[serde(default)]` attribute in Rust frontend to handle `null` values as empty arrays.

**Affected Fields**
- `performance_analysis.bottlenecks`
- `recommendations`
- `downtime_analysis.downtime_events`

---

## Technical Changes

### Backend (Go)

**New Files: None**

**Modified Files**
- `BE/arfni/internal/pricing/prometheus.go`
  - Added `GetServerStatus()`: Function to check server online status
  - Added `GetDowntimeHistory()`: Function to retrieve 24-hour downtime history
  - Added `GetMetricsBeforeDowntime()`: Function to query metrics immediately before downtime
  - Added `MetricsSnapshot`, `DowntimeEvent` structs

- `BE/arfni/internal/pricing/optimizer.go`
  - Added `analyzeDowntime()`: Downtime analysis logic
  - Added `estimateDowntimeCause()`: Downtime cause estimation function
  - Added `DowntimeAnalysis`, `DowntimeEventSummary` structs
  - Added `downtime_analysis` field to `OptimizationReport`
  - Included server availability information in AI prompts
  - Improved empty slice initialization (prevent nil)

- `BE/arfni/cmd/arfni-go/main.go`
  - Enhanced JSON serialization error handling

### Frontend (Rust)

**Modified Files**
- `arfni-gui/src-tauri/src/commands/pricing.rs`
  - Added `MetricsSnapshot`, `DowntimeEventSummary`, `DowntimeAnalysis` structs
  - Added `downtime_analysis` field to `OptimizationReport`
  - Added `#[serde(default)]` to `PerformanceAnalysis.bottlenecks` and `OptimizationReport.recommendations`

- `arfni-gui/src-tauri/src/commands/monitoring.rs`
  - Added `check_server_status()`: Tauri command for server status check

- `arfni-gui/src-tauri/src/main.rs`
  - Registered `check_server_status` command

### Frontend (TypeScript)

**Modified Files**
- `arfni-gui/src/pages/logs/ui/OptimizeView.tsx`
  - Added `MetricsSnapshot`, `DowntimeEventSummary`, `DowntimeAnalysis` interfaces
  - Added `downtime_analysis` field to `OptimizationReport`
  - Added server availability section UI

- `arfni-gui/src/shared/config/i18n/locales/ko/logs.json`
  - Added Korean translations for server availability

- `arfni-gui/src/shared/config/i18n/locales/en/logs.json`
  - Added English translations for server availability

---

## Bug Fixes

None

---

## Known Issues

None

---

## Upgrade Guide

When upgrading to v1.0.2 from previous versions, the following features will be automatically enabled:

- Server availability information is automatically collected when running optimization analysis
- Works without additional configuration if Prometheus is running normally and collecting `up` metrics
- No configuration changes or data migration required

---

**Full Changelog:** v1.0.1...v1.0.2
