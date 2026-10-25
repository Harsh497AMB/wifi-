package com.example.wifiprovardhit.domain

import kotlin.math.abs
import kotlin.math.pow

object WifiDomainUtils {

    fun frequencyToChannel(freqMhz: Int): Int {
        return when {
            freqMhz == 2484 -> 14
            freqMhz in 2412..2472 -> (freqMhz - 2412) / 5 + 1
            freqMhz in 5170..5825 -> (freqMhz - 5000) / 5
            freqMhz in 5955..7115 -> (freqMhz - 5950) / 5
            else -> 0
        }
    }

    fun frequencyToBand(freqMhz: Int): String {
        return when {
            freqMhz in 2400..2500 -> "2.4 GHz"
            freqMhz in 5000..5900 -> "5 GHz"
            freqMhz in 5925..7200 -> "6 GHz"
            else -> "Unknown"
        }
    }

    fun channelWidthLabel(widthCode: Int): String {
        return when (widthCode) {
            0 -> "20 MHz"
            1 -> "40 MHz"
            2 -> "80 MHz"
            3 -> "160 MHz"
            4 -> "80+80 MHz"
            5 -> "320 MHz"
            else -> "Unknown"
        }
    }

    fun estimateDistanceMeters(rssi: Int, a: Double = -45.0, n: Double = 2.5): Double {
        if (rssi >= 0) return 0.1
        val exponent = (a - rssi) / (10.0 * n)
        val distance = 10.0.pow(exponent)
        return distance.coerceIn(0.1, 100.0)
    }

    fun securityType(capabilities: String): String {
        val caps = capabilities.uppercase()
        return when {
            caps.contains("WPA3") && caps.contains("WPA2") -> "WPA2/WPA3 Mixed"
            caps.contains("WPA3") -> "WPA3-SAE"
            caps.contains("WPA2") -> "WPA2-PSK"
            caps.contains("WPA") -> "WPA"
            caps.contains("WEP") -> "WEP"
            caps.contains("OWE") -> "OWE"
            caps.isEmpty() || caps == "[ESS]" -> "OPEN"
            else -> "OPEN"
        }
    }

    fun rssiToColorFraction(rssi: Int, worst: Int = -85, best: Int = -35): Float {
        val clamped = rssi.coerceIn(worst, best)
        val range = (best - worst).toFloat()
        if (range <= 0f) return 0f
        return ((clamped - worst) / range).coerceIn(0f, 1f)
    }

    fun rssiQuality(rssi: Int): String {
        return when {
            rssi >= -50 -> "Excellent"
            rssi >= -60 -> "Good"
            rssi >= -70 -> "Fair"
            rssi >= -85 -> "Weak"
            else -> "Dead zone"
        }
    }
}
