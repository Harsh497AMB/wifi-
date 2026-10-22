package com.example.wifiprovardhit.ui.heatmap

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.example.wifiprovardhit.R

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HeatmapScreen() {
    // Simulated matrix of dBm values from server / cache
    // Values typically range from -90 dBm (weak/1) to -30 dBm (strong/0) normalized to 0..1
    val matrixData = remember {
        arrayOf(
            floatArrayOf(0.2f, 0.4f, 0.6f, 0.8f, 0.9f),
            floatArrayOf(0.1f, 0.3f, 0.5f, 0.7f, 0.8f),
            floatArrayOf(0.0f, 0.2f, 0.4f, 0.6f, 0.7f),
            floatArrayOf(0.3f, 0.5f, 0.7f, 0.9f, 1.0f)
        )
    }

    var imageLoadedSuccessfully by remember { mutableStateOf(true) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.tab_heatmap)) }
            )
        }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = stringResource(R.string.matrix_heatmap_title),
                style = MaterialTheme.typography.titleMedium
            )
            Spacer(modifier = Modifier.height(16.dp))

            if (!imageLoadedSuccessfully) {
                // Error state when image doesn't come
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(300.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(MaterialTheme.colorScheme.errorContainer),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(
                            imageVector = Icons.Default.Warning,
                            contentDescription = "Error",
                            tint = MaterialTheme.colorScheme.onErrorContainer,
                            modifier = Modifier.size(48.dp)
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = stringResource(R.string.heatmap_error),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onErrorContainer
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Button(onClick = { imageLoadedSuccessfully = true }) {
                            Text("Retry Loading")
                        }
                    }
                }
            } else {
                // Heatmap & Floor plan view area
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(350.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant),
                    contentAlignment = Alignment.Center
                ) {
                    // Render heatmap cells based on normalized 0-1 values
                    // 0 = Green (strong), 1 = Red (weak/dead zone), smooth transition
                    Canvas(modifier = Modifier.fillMaxSize().padding(16.dp)) {
                        val rows = matrixData.size
                        val cols = if (rows > 0) matrixData[0].size else 1
                        val cellWidth = size.width / cols
                        val cellHeight = size.height / rows

                        for (r in 0 until rows) {
                            for (c in 0 until cols) {
                                val value = matrixData[r][c].coerceIn(0f, 1f)
                                // Smooth transition: 0.0 (green, hue 120) to 1.0 (red, hue 0)
                                val hue = (1f - value) * 120f
                                val cellColor = Color.hsl(hue, 0.85f, 0.5f, alpha = 0.7f)

                                drawRect(
                                    color = cellColor,
                                    topLeft = androidx.compose.ui.geometry.Offset(c * cellWidth, r * cellHeight),
                                    size = androidx.compose.ui.geometry.Size(cellWidth - 4f, cellHeight - 4f)
                                )
                            }
                        }
                    }

                    // Simulated cached floor plan overlay label
                    Surface(
                        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.8f),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier
                            .align(Alignment.BottomCenter)
                            .padding(12.dp)
                    ) {
                        Text(
                            text = "Floor Plan Cached (ID: block_floor_01)",
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Button(onClick = { imageLoadedSuccessfully = false }) {
                    Text("Simulate Image Error")
                }
                Button(onClick = { imageLoadedSuccessfully = true }) {
                    Text("Reset / Reload")
                }
            }
        }
    }
}
