package com.example.wifiprovardhit.data.wifi

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.wifi.ScanResult
import android.net.wifi.WifiManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.example.wifiprovardhit.BuildConfig
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class ScanSnapshot(
    val results: List<ScanResult> = emptyList(),
    val scannedAtMillis: Long = 0L,
    val throttled: Boolean = false
)

class WifiScanner(private val context: Context) {
    private val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager

    private val _snapshot = MutableStateFlow(ScanSnapshot())
    val snapshot: StateFlow<ScanSnapshot> = _snapshot.asStateFlow()

    private var lastScanRequestTime = 0L
    private val minScanIntervalMs = 30_000L

    private val scanReceiver = object : BroadcastReceiver() {
        override fun onReceive(c: Context?, intent: Intent?) {
            if (intent?.action == WifiManager.SCAN_RESULTS_AVAILABLE_ACTION) {
                updateResults()
            }
        }
    }

    private var receiverRegistered = false

    init {
        updateResults()
    }

    fun registerReceiver() {
        if (!receiverRegistered) {
            try {
                val filter = IntentFilter(WifiManager.SCAN_RESULTS_AVAILABLE_ACTION)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    context.registerReceiver(scanReceiver, filter, Context.RECEIVER_EXPORTED)
                } else {
                    context.registerReceiver(scanReceiver, filter)
                }
                receiverRegistered = true
            } catch (e: Exception) {
                if (BuildConfig.DEBUG) {
                    e.printStackTrace()
                }
            }
        }
    }

    fun unregisterReceiver() {
        if (receiverRegistered) {
            try {
                context.unregisterReceiver(scanReceiver)
                receiverRegistered = false
            } catch (e: Exception) {
                if (BuildConfig.DEBUG) {
                    e.printStackTrace()
                }
            }
        }
    }

    fun updateResults() {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            return
        }
        try {
            val results = wifiManager?.scanResults ?: emptyList()
            _snapshot.value = ScanSnapshot(
                results = results,
                scannedAtMillis = System.currentTimeMillis(),
                throttled = _snapshot.value.throttled
            )
        } catch (e: SecurityException) {
            if (BuildConfig.DEBUG) {
                e.printStackTrace()
            }
        }
    }

    fun requestScan(): Boolean {
        val now = System.currentTimeMillis()
        if (now - lastScanRequestTime < minScanIntervalMs) {
            _snapshot.value = _snapshot.value.copy(throttled = true)
            return false
        }
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            return false
        }
        try {
            val success = wifiManager?.startScan() ?: false
            lastScanRequestTime = now
            _snapshot.value = _snapshot.value.copy(throttled = !success)
            return success
        } catch (e: SecurityException) {
            if (BuildConfig.DEBUG) {
                e.printStackTrace()
            }
            _snapshot.value = _snapshot.value.copy(throttled = true)
            return false
        }
    }
}
