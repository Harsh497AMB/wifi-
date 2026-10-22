# Wi-Fi Dead Zone Mapper — Project Specification

## Overview
Indoor Wi-Fi mapping application built with Kotlin, Jetpack Compose, and Material 3.
Designed for mapping Wi-Fi signal strength (RSSI) across indoor floor plans without internet access.

## Core Features
1. **AP Radar Tab (Tab 1)**: Lists nearby Wi-Fi access points with channel, frequency, security, estimated distance, and RSSI color coding (Green = strong, Red = weak). Throttle-aware scanning (at most once per 30s) + cached results.
2. **Live Telemetry Tab (Tab 2)**: Real-time RSSI polling (every 2s) of the connected network, live Vico line chart, statistics (min, max, avg, link speed), and session history persisted via Room.
3. **Floor Plan Heatmap Tab (Tab 3)**: Interactive pan/zoom floor plan canvas, checkpoint surveying with 5-sample median averaging, and Inverse Distance Weighting (IDW) interpolation heatmap overlay.

## Non-Functional Requirements
- **No Internet**: No INTERNET permission, no analytics, no Firebase, no Google Maps, no GPS.
- **Architecture**: Clean architecture (`data/`, `domain/`, `ui/`). Domain layer is pure Kotlin with unit tests.
- **UI**: Material 3, dynamic theming via `ui/theme/`, accessibility, edge-to-edge support.
- **Release**: R8 minification/shrinking enabled, backup disabled, exportable reports (PNG heatmap, CSV data).
