package com.example.wifiprovardhit.ui.components

import android.net.wifi.ScanResult
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.example.wifiprovardhit.domain.WifiDomainUtils

@Composable
fun ApCard(
    scanResult: ScanResult,
    isAccessibleConnected: Boolean = false,
    onClick: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    val ssid = if (scanResult.SSID.isNullOrEmpty()) "<Hidden network>" else scanResult.SSID
    val bssid = scanResult.BSSID ?: ""
    val rssi = scanResult.level
    val freq = scanResult.frequency
    val band = WifiDomainUtils.frequencyToBand(freq)
    val channel = WifiDomainUtils.frequencyToChannel(freq)
    val channelWidth = WifiDomainUtils.channelWidthLabel(scanResult.channelWidth)
    val security = WifiDomainUtils.securityType(scanResult.capabilities)
    val quality = WifiDomainUtils.rssiQuality(rssi)
    val distance = WifiDomainUtils.estimateDistanceMeters(rssi)
    val fraction = WifiDomainUtils.rssiToColorFraction(rssi)
    
    // Hue 0 (red) to 120 (green)
    val signalColor = Color.hsl(fraction * 120f, 0.8f, 0.5f)

    Card(
        onClick = onClick,
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = ssid,
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.weight(1f)
                )
                if (isAccessibleConnected) {
                    Surface(
                        shape = RoundedCornerShape(16.dp),
                        color = MaterialTheme.colorScheme.primaryContainer,
                        modifier = Modifier.padding(start = 8.dp)
                    ) {
                        Text(
                            text = "Connected",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onPrimaryContainer,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(6.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "BSSID: $bssid",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(10.dp)
                            .clip(CircleShape)
                            .background(signalColor)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = "$rssi dBm ($quality)",
                        style = MaterialTheme.typography.bodyMedium,
                        color = signalColor
                    )
                }
            }

            Spacer(modifier = Modifier.height(8.dp))
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant, thickness = 0.5.dp)
            Spacer(modifier = Modifier.height(8.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = "Band: $band (Ch $channel)",
                    style = MaterialTheme.typography.bodySmall
                )
                Text(
                    text = "Width: $channelWidth",
                    style = MaterialTheme.typography.bodySmall
                )
            }

            Spacer(modifier = Modifier.height(4.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = "Security: $security",
                    style = MaterialTheme.typography.bodySmall
                )
                Text(
                    text = "Est. Dist: ~${String.format("%.1f", distance)} m",
                    style = MaterialTheme.typography.bodySmall
                )
            }
        }
    }
}
