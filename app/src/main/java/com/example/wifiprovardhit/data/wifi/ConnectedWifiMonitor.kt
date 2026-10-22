package com.example.wifiprovardhit.data.wifi

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.WifiInfo
import android.net.wifi.WifiManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.example.wifiprovardhit.BuildConfig
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.isActive

data class ConnectedSample(
    val ssid: String,
    val bssid: String,
    val rssi: Int,
    val linkSpeed: Int,
    val frequency: Int,
    val timestamp: Long
)

class ConnectedWifiMonitor(private val context: Context) {
    private val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
    private val connectivityManager = context.applicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager

    fun pollConnectedWifi(intervalMs: Long = 2000L) = flow {
        while (currentCoroutineContext().isActive) {
            val sample = fetchCurrentConnection()
            emit(sample)
            delay(intervalMs)
        }
    }

    private fun fetchCurrentConnection(): ConnectedSample? {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_WIFI_STATE) != PackageManager.PERMISSION_GRANTED) {
            return null
        }

        try {
            var ssid = "<unknown ssid>"
            var bssid = ""
            var rssi = -127
            var linkSpeed = 0
            var frequency = 0

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val network = connectivityManager?.activeNetwork
                val caps = connectivityManager?.getNetworkCapabilities(network)
                if (caps != null && caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
                    val wifiInfo = caps.transportInfo as? WifiInfo
                    if (wifiInfo != null) {
                        ssid = wifiInfo.ssid?.removeSurrounding("\"") ?: "<unknown ssid>"
                        bssid = wifiInfo.bssid ?: ""
                        rssi = wifiInfo.rssi
                        linkSpeed = wifiInfo.linkSpeed
                        frequency = wifiInfo.frequency
                    }
                }
            }

            if (rssi <= -127 || ssid.contains("unknown", ignoreCase = true)) {
                @Suppress("DEPRECATION")
                val connectionInfo = wifiManager?.connectionInfo
                if (connectionInfo != null) {
                    val connSsid = connectionInfo.ssid?.removeSurrounding("\"") ?: "<unknown ssid>"
                    val connBssid = connectionInfo.bssid ?: ""
                    val connRssi = connectionInfo.rssi
                    if (connRssi > -127 && !connSsid.contains("unknown", ignoreCase = true)) {
                        ssid = connSsid
                        bssid = connBssid
                        rssi = connRssi
                        linkSpeed = connectionInfo.linkSpeed
                        frequency = connectionInfo.frequency
                    }
                }
            }

            if (rssi <= -127 || ssid.isEmpty() || ssid.contains("unknown", ignoreCase = true)) {
                return null
            }

            return ConnectedSample(
                ssid = ssid,
                bssid = bssid,
                rssi = rssi,
                linkSpeed = linkSpeed,
                frequency = frequency,
                timestamp = System.currentTimeMillis()
            )
        } catch (e: Exception) {
            if (BuildConfig.DEBUG) {
                e.printStackTrace()
            }
            return null
        }
    }
}
