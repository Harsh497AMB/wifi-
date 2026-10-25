package com.example.wifiprovardhit.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class WifiDomainUtilsTest {

    @Test
    fun testFrequencyToChannel() {
        assertEquals(1, WifiDomainUtils.frequencyToChannel(2412))
        assertEquals(6, WifiDomainUtils.frequencyToChannel(2437))
        assertEquals(13, WifiDomainUtils.frequencyToChannel(2472))
        assertEquals(14, WifiDomainUtils.frequencyToChannel(2484))
        assertEquals(36, WifiDomainUtils.frequencyToChannel(5180))
        assertEquals(0, WifiDomainUtils.frequencyToChannel(1234))
    }

    @Test
    fun testFrequencyToBand() {
        assertEquals("2.4 GHz", WifiDomainUtils.frequencyToBand(2437))
        assertEquals("5 GHz", WifiDomainUtils.frequencyToBand(5180))
        assertEquals("6 GHz", WifiDomainUtils.frequencyToBand(5955))
        assertEquals("Unknown", WifiDomainUtils.frequencyToBand(1000))
    }

    @Test
    fun testChannelWidthLabel() {
        assertEquals("20 MHz", WifiDomainUtils.channelWidthLabel(0))
        assertEquals("40 MHz", WifiDomainUtils.channelWidthLabel(1))
        assertEquals("80 MHz", WifiDomainUtils.channelWidthLabel(2))
        assertEquals("160 MHz", WifiDomainUtils.channelWidthLabel(3))
        assertEquals("320 MHz", WifiDomainUtils.channelWidthLabel(5))
        assertEquals("Unknown", WifiDomainUtils.channelWidthLabel(99))
    }

    @Test
    fun testEstimateDistanceMeters() {
        val distStrong = WifiDomainUtils.estimateDistanceMeters(-45)
        assertEquals(1.0, distStrong, 0.01)

        val distWeak = WifiDomainUtils.estimateDistanceMeters(-70)
        assertTrue(distWeak > 1.0)

        val distClampedMin = WifiDomainUtils.estimateDistanceMeters(-20)
        assertEquals(0.1, distClampedMin, 0.01)

        val distClampedMax = WifiDomainUtils.estimateDistanceMeters(-110)
        assertEquals(100.0, distClampedMax, 0.01)
    }

    @Test
    fun testSecurityType() {
        assertEquals("OPEN", WifiDomainUtils.securityType("[ESS]"))
        assertEquals("WPA2-PSK", WifiDomainUtils.securityType("[WPA2-PSK-CCMP][ESS]"))
        assertEquals("WPA3-SAE", WifiDomainUtils.securityType("[WPA3-SAE][ESS]"))
        assertEquals("WPA2/WPA3 Mixed", WifiDomainUtils.securityType("[WPA2-PSK-CCMP][WPA3-SAE][ESS]"))
        assertEquals("WEP", WifiDomainUtils.securityType("[WEP]"))
    }

    @Test
    fun testRssiToColorFraction() {
        assertEquals(1f, WifiDomainUtils.rssiToColorFraction(-30)) // better than best
        assertEquals(0f, WifiDomainUtils.rssiToColorFraction(-90)) // worse than worst
        assertEquals(0.5f, WifiDomainUtils.rssiToColorFraction(-60, worst = -85, best = -35))
    }

    @Test
    fun testRssiQuality() {
        assertEquals("Excellent", WifiDomainUtils.rssiQuality(-45))
        assertEquals("Good", WifiDomainUtils.rssiQuality(-55))
        assertEquals("Fair", WifiDomainUtils.rssiQuality(-65))
        assertEquals("Weak", WifiDomainUtils.rssiQuality(-75))
        assertEquals("Dead zone", WifiDomainUtils.rssiQuality(-90))
    }
}
