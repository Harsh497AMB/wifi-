package com.example.wifiprovardhit.ui.radar

import android.Manifest
import android.content.pm.PackageManager
import android.net.Uri
import android.net.wifi.ScanResult
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import coil.compose.AsyncImage
import com.example.wifiprovardhit.data.api.ApiClient
import com.example.wifiprovardhit.data.api.MeasurementItem
import com.example.wifiprovardhit.domain.WifiDomainUtils
import com.example.wifiprovardhit.ui.components.ApCard
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.*
import kotlin.math.pow
import kotlin.math.sqrt

data class IndoorBlock(
    val id: String,
    val name: String,
    val imageUrl: String,
    val lat: Double,
    val lon: Double,
    val imageUri: Uri? = null
)

data class HeatmapViewState(
    val scanResult: ScanResult,
    val block: IndoorBlock,
    val imageUrl: String,
    val matrix: List<List<Any?>>,
    val rows: Int,
    val cols: Int,
    val width: Int,
    val height: Int,
    val measurements: List<MeasurementItem>?
)

data class PositionPickingState(
    val scanResult: ScanResult,
    val block: IndoorBlock,
    val imageUrl: String,
    val matrix: List<List<Any?>>,
    val rows: Int,
    val cols: Int,
    val width: Int,
    val height: Int
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RadarScreen(
    viewModel: RadarViewModel = androidx.lifecycle.viewmodel.compose.viewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val coroutineScope = rememberCoroutineScope()
    val context = LocalContext.current

    var apiStatusMessage by remember { mutableStateOf<String?>(null) }

    var hasLocationPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        )
    }
    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        hasLocationPermission = permissions[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
                permissions[Manifest.permission.ACCESS_COARSE_LOCATION] == true
    }

    val cachedBlocks = remember { mutableStateListOf<IndoorBlock>() }

    suspend fun fetchBlocks() {
        try {
            val response = ApiClient.instance.getAllBlocks()
            withContext(Dispatchers.Main) {
                if (response.isSuccessful) {
                    val resObj = response.body()
                    cachedBlocks.clear()
                    resObj?.blocks?.forEach { sb ->
                        cachedBlocks.add(
                            IndoorBlock(
                                id = sb.blockId,
                                name = sb.blockName,
                                imageUrl = sb.blockImage?.url ?: "",
                                lat = sb.location?.lat ?: 0.0,
                                lon = sb.location?.lon ?: 0.0
                            )
                        )
                    }
                    apiStatusMessage = "Fetched ${cachedBlocks.size} block(s) [GET /blocks]"
                } else {
                    apiStatusMessage = "Server error [GET /blocks] (${response.code()}): ${response.errorBody()?.string()}"
                }
            }
        } catch (e: Exception) {
            withContext(Dispatchers.Main) {
                apiStatusMessage = "Network error [GET /blocks]: ${e.localizedMessage}"
            }
        }
    }

    LaunchedEffect(Unit) {
        if (!hasLocationPermission) {
            permissionLauncher.launch(
                arrayOf(
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION
                )
            )
        }
        fetchBlocks()
    }

    var showCreateBlockDialog by remember { mutableStateOf(false) }
    var targetSsidForNewBlock by remember { mutableStateOf<String?>(null) }
    var newBlockName by remember { mutableStateOf("") }
    var newBlockLat by remember { mutableStateOf("37.4219983") }
    var newBlockLon by remember { mutableStateOf("-122.084") }
    var selectedImageUriForCreate by remember { mutableStateOf<Uri?>(null) }

    val imagePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        if (uri != null) {
            selectedImageUriForCreate = uri
        }
    }

    var selectedScanResultForBlocks by remember { mutableStateOf<ScanResult?>(null) }
    val wifiBlockAssignments = remember { mutableStateMapOf<String, MutableList<String>>() }
    var showAddBlockDialog by remember { mutableStateOf(false) }
    var heatmapViewState by remember { mutableStateOf<HeatmapViewState?>(null) }
    var positionPickingState by remember { mutableStateOf<PositionPickingState?>(null) }
    var pickedPositionMessage by remember { mutableStateOf<String?>(null) }

    val filteredList = uiState.scanResults.filter { result ->
        val matchesSearch = uiState.searchQuery.isEmpty() ||
                (result.SSID?.contains(uiState.searchQuery, ignoreCase = true) == true) ||
                (result.BSSID?.contains(uiState.searchQuery, ignoreCase = true) == true)

        val band = WifiDomainUtils.frequencyToBand(result.frequency)
        val matchesBand = when (uiState.selectedBand) {
            BandFilter.ALL -> true
            BandFilter.BAND_2_4_GHZ -> band == "2.4 GHz"
            BandFilter.BAND_5_GHZ -> band == "5 GHz"
            BandFilter.BAND_6_GHZ -> band == "6 GHz"
        }
        matchesSearch && matchesBand
    }.sortedByDescending { it.level }

    val formattedTime = remember(uiState.lastUpdatedMillis) {
        if (uiState.lastUpdatedMillis == 0L) "Never"
        else SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date(uiState.lastUpdatedMillis))
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Wi-Fi AP Radar") },
                actions = {
                    IconButton(onClick = {
                        targetSsidForNewBlock = null
                        showCreateBlockDialog = true
                    }) {
                        Icon(Icons.Default.Add, contentDescription = "Create Block")
                    }
                    IconButton(onClick = { viewModel.refresh() }) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh")
                    }
                }
            )
        }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(horizontal = 16.dp)
        ) {
            if (!hasLocationPermission) {
                Button(
                    onClick = {
                        permissionLauncher.launch(
                            arrayOf(
                                Manifest.permission.ACCESS_FINE_LOCATION,
                                Manifest.permission.ACCESS_COARSE_LOCATION
                            )
                        )
                    },
                    modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
                ) {
                    Text("Grant Location Permission (Required for Wi-Fi scanning)")
                }
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 8.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Last updated: $formattedTime",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                if (uiState.throttled) {
                    Text(
                        text = "Android scan throttled (cached)",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error
                    )
                }
            }

            if (apiStatusMessage != null) {
                Surface(
                    color = MaterialTheme.colorScheme.primaryContainer,
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)
                ) {
                    Text(
                        text = apiStatusMessage!!,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                        modifier = Modifier.padding(8.dp)
                    )
                }
            }

            OutlinedTextField(
                value = uiState.searchQuery,
                onValueChange = { viewModel.setSearchQuery(it) },
                label = { Text("Search SSID / BSSID") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )

            Spacer(modifier = Modifier.height(8.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                BandFilter.entries.forEach { band ->
                    FilterChip(
                        selected = uiState.selectedBand == band,
                        onClick = { viewModel.setBandFilter(band) },
                        label = {
                            Text(
                                when (band) {
                                    BandFilter.ALL -> "All"
                                    BandFilter.BAND_2_4_GHZ -> "2.4 GHz"
                                    BandFilter.BAND_5_GHZ -> "5 GHz"
                                    BandFilter.BAND_6_GHZ -> "6 GHz"
                                }
                            )
                        }
                    )
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            if (filteredList.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .weight(1f),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "No Wi-Fi access points found.\nEnsure Location is ON and permissions granted.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            } else {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxSize()
                        .weight(1f),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    contentPadding = PaddingValues(bottom = 16.dp)
                ) {
                    items(filteredList, key = { it.BSSID ?: it.hashCode().toString() }) { result ->
                        ApCard(
                            scanResult = result,
                            onClick = {
                                selectedScanResultForBlocks = result
                                val ssid = result.SSID ?: "Hidden"
                                val finalSsid = if (ssid.isEmpty()) "Hidden" else ssid
                                coroutineScope.launch(Dispatchers.IO) {
                                    try {
                                        val response = ApiClient.instance.getWifiBySsid(finalSsid)
                                        withContext(Dispatchers.Main) {
                                            val assignedList = wifiBlockAssignments.getOrPut(finalSsid) { mutableStateListOf() }
                                            assignedList.clear()
                                            if (response.isSuccessful) {
                                                val bodyStr = response.body()?.string() ?: "{}"
                                                val json = JSONObject(bodyStr)
                                                val wifiObj = json.optJSONObject("wifi")
                                                val blocksArr = wifiObj?.optJSONArray("blocks")
                                                if (blocksArr != null) {
                                                    for (i in 0 until blocksArr.length()) {
                                                        val bObj = blocksArr.optJSONObject(i)
                                                        val bId = bObj?.optString("blockId")
                                                        if (!bId.isNullOrEmpty()) {
                                                            assignedList.add(bId)
                                                        }
                                                    }
                                                }
                                                apiStatusMessage = "Fetched Wi-Fi info for $finalSsid successfully [GET /wifi/$finalSsid]"
                                            } else if (response.code() == 404) {
                                                apiStatusMessage = "No blocks for '$finalSsid' yet. Tap '+' to assign one."
                                            } else {
                                                val err = response.errorBody()?.string() ?: "error"
                                                apiStatusMessage = "Error [GET /wifi/$finalSsid] (${response.code()}): $err"
                                            }
                                        }
                                    } catch (e: Exception) {
                                        withContext(Dispatchers.Main) {
                                            apiStatusMessage = "Network error [GET /wifi/$finalSsid]: ${e.localizedMessage}"
                                        }
                                    }
                                }
                            }
                        )
                    }
                }
            }
        }

        // 1. Create Block Dialog (with optional auto-assign to targetSsidForNewBlock)
        if (showCreateBlockDialog) {
            AlertDialog(
                onDismissRequest = {
                    showCreateBlockDialog = false
                    targetSsidForNewBlock = null
                },
                title = { Text(if (targetSsidForNewBlock != null) "Create & Assign Block to $targetSsidForNewBlock" else "Create New Block (/createBlock)") },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(
                            value = newBlockName,
                            onValueChange = { newBlockName = it },
                            label = { Text("Block Name") },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true
                        )
                        OutlinedTextField(
                            value = newBlockLat,
                            onValueChange = { newBlockLat = it },
                            label = { Text("Latitude (lat)") },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true
                        )
                        OutlinedTextField(
                            value = newBlockLon,
                            onValueChange = { newBlockLon = it },
                            label = { Text("Longitude (lon)") },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true
                        )

                        Button(
                            onClick = { imagePickerLauncher.launch("image/*") },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(if (selectedImageUriForCreate == null) "Select Floor Map Image from Storage" else "Image Selected ✓")
                        }
                    }
                },
                confirmButton = {
                    val isCreateEnabled = newBlockName.isNotBlank() && selectedImageUriForCreate != null
                    Button(
                        enabled = isCreateEnabled,
                        onClick = {
                            val name = newBlockName
                            val latStr = newBlockLat
                            val lonStr = newBlockLon
                            val uri = selectedImageUriForCreate!!
                            val targetSsid = targetSsidForNewBlock

                            showCreateBlockDialog = false
                            targetSsidForNewBlock = null

                            coroutineScope.launch(Dispatchers.IO) {
                                try {
                                    val inputStream = context.contentResolver.openInputStream(uri)
                                    val bytes = inputStream?.use { it.readBytes() } ?: byteArrayOf()
                                    val mime = context.contentResolver.getType(uri) ?: "image/png"
                                    val ext = if (mime.contains("jpeg") || mime.contains("jpg")) "jpg" else "png"

                                    val nameBody = name.toRequestBody("text/plain".toMediaTypeOrNull())
                                    val latBody = latStr.toRequestBody("text/plain".toMediaTypeOrNull())
                                    val lonBody = lonStr.toRequestBody("text/plain".toMediaTypeOrNull())
                                    val imageBody = bytes.toRequestBody(mime.toMediaTypeOrNull())
                                    val imagePart = MultipartBody.Part.createFormData("blockImage", "floor_map.$ext", imageBody)

                                    val response = ApiClient.instance.createBlock(imagePart, nameBody, latBody, lonBody)
                                    withContext(Dispatchers.Main) {
                                        if (response.isSuccessful) {
                                            apiStatusMessage = "POST /createBlock successful!"
                                            fetchBlocks()

                                            if (targetSsid != null) {
                                                val bodyStr = response.body()?.string() ?: "{}"
                                                val json = JSONObject(bodyStr)
                                                val blockObj = json.optJSONObject("block")
                                                val newBlockId = blockObj?.optString("blockId") ?: cachedBlocks.lastOrNull()?.id

                                                if (!newBlockId.isNullOrEmpty()) {
                                                    val assignedList = wifiBlockAssignments.getOrPut(targetSsid) { mutableStateListOf() }
                                                    if (!assignedList.contains(newBlockId)) {
                                                        assignedList.add(newBlockId)
                                                    }
                                                    coroutineScope.launch(Dispatchers.IO) {
                                                        try {
                                                            ApiClient.instance.addBlock(
                                                                mapOf<String, Any>(
                                                                    "ssid" to targetSsid,
                                                                    "wifiSsid" to targetSsid,
                                                                    "blockId" to newBlockId
                                                                )
                                                            )
                                                        } catch (_: Exception) {}
                                                    }
                                                }
                                            }

                                            newBlockName = ""
                                            newBlockLat = "37.4219983"
                                            newBlockLon = "-122.084"
                                            selectedImageUriForCreate = null
                                        } else {
                                            val errBody = response.errorBody()?.string() ?: "unknown error"
                                            apiStatusMessage = "POST /createBlock failed (${response.code()}): $errBody"
                                        }
                                    }
                                } catch (e: Exception) {
                                    withContext(Dispatchers.Main) {
                                        apiStatusMessage = "Network error [POST /createBlock]: ${e.localizedMessage}"
                                    }
                                }
                            }
                        }
                    ) {
                        Text(if (targetSsidForNewBlock != null) "Create & Assign" else "Create")
                    }
                },
                dismissButton = {
                    TextButton(onClick = {
                        showCreateBlockDialog = false
                        targetSsidForNewBlock = null
                    }) {
                        Text("Cancel")
                    }
                }
            )
        }

        // 2. Wi-Fi Blocks Management Dialog
        selectedScanResultForBlocks?.let { scanResult ->
            val rawSsid = scanResult.SSID ?: "Hidden"
            val ssidKey = if (rawSsid.isEmpty()) "Hidden" else rawSsid
            val assignedBlockIds = wifiBlockAssignments.getOrPut(ssidKey) { mutableStateListOf() }
            val associatedBlocks = cachedBlocks.filter { assignedBlockIds.contains(it.id) }

            AlertDialog(
                onDismissRequest = { selectedScanResultForBlocks = null },
                title = { Text("Blocks for: $ssidKey") },
                text = {
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text("Associated Indoor Blocks", style = MaterialTheme.typography.titleSmall)
                            IconButton(onClick = { showAddBlockDialog = true }) {
                                Icon(Icons.Default.Add, contentDescription = "Add Block")
                            }
                        }

                        if (associatedBlocks.isEmpty()) {
                            Text(
                                "No blocks assigned. Tap '+' to assign block.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        } else {
                            LazyColumn(
                                modifier = Modifier.height(180.dp),
                                verticalArrangement = Arrangement.spacedBy(4.dp)
                            ) {
                                items(associatedBlocks) { block ->
                                    Card(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .clickable {
                                                selectedScanResultForBlocks = null
                                                coroutineScope.launch(Dispatchers.IO) {
                                                    try {
                                                        val response = ApiClient.instance.getWifiBlockPath(
                                                            ssidKey,
                                                            blockId = block.id,
                                                            lat = block.lat,
                                                            lon = block.lon
                                                        )
                                                        withContext(Dispatchers.Main) {
                                                            var imgUrl = block.imageUrl
                                                            val matrixList = mutableListOf<List<Any?>>()
                                                            var rows = 50
                                                            var cols = 50
                                                            var width = 1000
                                                            var height = 1000
                                                            var measurements: List<MeasurementItem>? = null

                                                            if (response.isSuccessful) {
                                                                val serverRes = response.body()
                                                                serverRes?.block?.image?.url?.let { if (it.isNotEmpty()) imgUrl = it }
                                                                serverRes?.block?.image?.width?.let { width = it }
                                                                serverRes?.block?.image?.height?.let { height = it }

                                                                serverRes?.wifi?.let { wifi ->
                                                                    wifi.rows?.let { rows = it }
                                                                    wifi.cols?.let { cols = it }
                                                                    wifi.measurements?.let { measurements = it }
                                                                    wifi.matrix?.let { m ->
                                                                        matrixList.addAll(m)
                                                                    }
                                                                }
                                                            }

                                                            if (matrixList.isEmpty() && measurements != null && measurements.isNotEmpty()) {
                                                                val computedMatrix = mutableListOf<List<Any?>>()
                                                                for (r in 0 until rows) {
                                                                    val rowList = mutableListOf<Any?>()
                                                                    for (c in 0 until cols) {
                                                                        val imgX = (c.toDouble() / cols) * width
                                                                        val imgY = (r.toDouble() / rows) * height

                                                                        var numerator = 0.0
                                                                        var denominator = 0.0
                                                                        var minDistance = Double.MAX_VALUE

                                                                        for (meas in measurements) {
                                                                            val dist = sqrt((meas.x - imgX).pow(2) + (meas.y - imgY).pow(2))
                                                                            if (dist < minDistance) minDistance = dist
                                                                            if (dist < 1.0) {
                                                                                numerator = meas.strength
                                                                                denominator = 1.0
                                                                                break
                                                                            }
                                                                            val weight = 1.0 / (dist * dist)
                                                                            numerator += meas.strength * weight
                                                                            denominator += weight
                                                                        }

                                                                        if (minDistance <= 150.0 && denominator > 0.0) {
                                                                            rowList.add(numerator / denominator)
                                                                        } else {
                                                                            rowList.add(null)
                                                                        }
                                                                    }
                                                                    computedMatrix.add(rowList)
                                                                }
                                                                matrixList.addAll(computedMatrix)
                                                            }

                                                            heatmapViewState = HeatmapViewState(
                                                                scanResult = scanResult,
                                                                block = block,
                                                                imageUrl = imgUrl,
                                                                matrix = matrixList,
                                                                rows = rows,
                                                                cols = cols,
                                                                width = width,
                                                                height = height,
                                                                measurements = measurements
                                                            )
                                                        }
                                                    } catch (_: Exception) {
                                                        withContext(Dispatchers.Main) {
                                                            heatmapViewState = HeatmapViewState(
                                                                scanResult = scanResult,
                                                                block = block,
                                                                imageUrl = block.imageUrl,
                                                                matrix = emptyList(),
                                                                rows = 50,
                                                                cols = 50,
                                                                width = 1000,
                                                                height = 1000,
                                                                measurements = null
                                                            )
                                                        }
                                                    }
                                                }
                                            },
                                        shape = RoundedCornerShape(8.dp),
                                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
                                    ) {
                                        Row(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .padding(12.dp),
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Column(modifier = Modifier.weight(1f)) {
                                                Text(block.name, style = MaterialTheme.typography.bodyMedium)
                                                Text("ID: ${block.id}", style = MaterialTheme.typography.bodySmall)
                                            }
                                            IconButton(onClick = {
                                                assignedBlockIds.remove(block.id)
                                                coroutineScope.launch(Dispatchers.IO) {
                                                    try {
                                                        val response = ApiClient.instance.deleteBlock(mapOf<String, Any>("blockId" to block.id, "ssid" to ssidKey))
                                                        withContext(Dispatchers.Main) {
                                                            if (response.isSuccessful) {
                                                                apiStatusMessage = "POST /delete successful!"
                                                            } else {
                                                                val err = response.errorBody()?.string() ?: "error"
                                                                apiStatusMessage = "POST /delete failed (${response.code()}): $err"
                                                            }
                                                        }
                                                    } catch (e: Exception) {
                                                        withContext(Dispatchers.Main) {
                                                            apiStatusMessage = "Network error [POST /delete]: ${e.localizedMessage}"
                                                        }
                                                    }
                                                }
                                            }) {
                                                Icon(
                                                    Icons.Default.Delete,
                                                    contentDescription = "Delete Block",
                                                    tint = MaterialTheme.colorScheme.error
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                confirmButton = {
                    TextButton(onClick = { selectedScanResultForBlocks = null }) {
                        Text("Close")
                    }
                }
            )
        }

        // Heatmap View Dialog
        heatmapViewState?.let { state ->
            val aspectRatio = if (state.height > 0) state.width.toFloat() / state.height.toFloat() else 1f

            AlertDialog(
                onDismissRequest = { heatmapViewState = null },
                title = { Text("Heatmap: ${state.block.name} (${state.scanResult.SSID})") },
                text = {
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .aspectRatio(aspectRatio)
                                .clip(RoundedCornerShape(8.dp))
                                .background(MaterialTheme.colorScheme.surfaceVariant),
                            contentAlignment = Alignment.Center
                        ) {
                            AsyncImage(
                                model = state.imageUrl,
                                contentDescription = state.block.name,
                                modifier = Modifier.matchParentSize(),
                                contentScale = ContentScale.FillBounds
                            )

                            Canvas(
                                modifier = Modifier
                                    .matchParentSize()
                                    .alpha(0.5f)
                            ) {
                                val rows = state.matrix.size
                                val cols = if (rows > 0) state.matrix[0].size else 1
                                val cellWidth = size.width / cols
                                val cellHeight = size.height / rows

                                for (r in 0 until rows) {
                                    for (c in 0 until cols) {
                                        val cellVal = state.matrix.getOrNull(r)?.getOrNull(c)
                                        val cellColor = if (cellVal != null && cellVal is Number) {
                                            val rssi = cellVal.toDouble().toInt()
                                            val clamped = rssi.coerceIn(-90, -40)
                                            val fraction = (clamped - (-90)) / (-40 - (-90)).toFloat()
                                            val hue = fraction * 120f
                                            Color.hsl(hue, 0.85f, 0.5f)
                                        } else {
                                            Color.Black
                                        }

                                        drawRect(
                                            color = cellColor,
                                            topLeft = androidx.compose.ui.geometry.Offset(c * cellWidth, r * cellHeight),
                                            size = Size(cellWidth, cellHeight)
                                        )
                                    }
                                }
                            }
                        }

                        Button(
                            onClick = {
                                val stateCopy = state
                                heatmapViewState = null
                                positionPickingState = PositionPickingState(
                                    scanResult = stateCopy.scanResult,
                                    block = stateCopy.block,
                                    imageUrl = stateCopy.imageUrl,
                                    matrix = stateCopy.matrix,
                                    rows = stateCopy.rows,
                                    cols = stateCopy.cols,
                                    width = stateCopy.width,
                                    height = stateCopy.height
                                )
                            },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text("Add Strength")
                        }
                    }
                },
                confirmButton = {
                    TextButton(onClick = { heatmapViewState = null }) {
                        Text("Close")
                    }
                }
            )
        }

        // 3. Add Block Dialog
        if (showAddBlockDialog && selectedScanResultForBlocks != null) {
            val rawSsid = selectedScanResultForBlocks!!.SSID ?: "Hidden"
            val ssidKey = if (rawSsid.isEmpty()) "Hidden" else rawSsid
            val assignedList = wifiBlockAssignments.getOrPut(ssidKey) { mutableStateListOf() }

            AlertDialog(
                onDismissRequest = { showAddBlockDialog = false },
                title = { Text("Add Block to Wi-Fi (POST /addblock)") },
                text = {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(max = 400.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text("Select block to assign to $ssidKey:", style = MaterialTheme.typography.bodySmall)
                        
                        LazyColumn(
                            modifier = Modifier
                                .fillMaxWidth()
                                .weight(1f),
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            items(cachedBlocks.filter { !assignedList.contains(it.id) }) { cachedBlock ->
                                Card(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable {
                                            assignedList.add(cachedBlock.id)
                                            showAddBlockDialog = false
                                            coroutineScope.launch(Dispatchers.IO) {
                                                try {
                                                    val response = ApiClient.instance.addBlock(mapOf<String, Any>("ssid" to ssidKey, "wifiSsid" to ssidKey, "blockId" to cachedBlock.id))
                                                    withContext(Dispatchers.Main) {
                                                        if (!response.isSuccessful) {
                                                            assignedList.remove(cachedBlock.id)
                                                            val err = response.errorBody()?.string() ?: "error"
                                                            apiStatusMessage = "POST /addblock failed (${response.code()}): $err"
                                                        } else {
                                                            apiStatusMessage = "POST /addblock successful!"
                                                        }
                                                    }
                                                } catch (e: Exception) {
                                                    withContext(Dispatchers.Main) {
                                                        assignedList.remove(cachedBlock.id)
                                                        apiStatusMessage = "Network error [POST /addblock]: ${e.localizedMessage}"
                                                    }
                                                }
                                            }
                                        },
                                    shape = RoundedCornerShape(12.dp),
                                    elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
                                ) {
                                    Column(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(12.dp)
                                    ) {
                                        Text(
                                            text = cachedBlock.name,
                                            style = MaterialTheme.typography.titleMedium
                                        )
                                        Spacer(modifier = Modifier.height(8.dp))
                                        Box(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .height(180.dp)
                                                .clip(RoundedCornerShape(8.dp))
                                                .background(MaterialTheme.colorScheme.surfaceVariant),
                                            contentAlignment = Alignment.Center
                                        ) {
                                            AsyncImage(
                                                model = cachedBlock.imageUrl,
                                                contentDescription = cachedBlock.name,
                                                modifier = Modifier.matchParentSize(),
                                                contentScale = ContentScale.Crop
                                            )
                                        }
                                    }
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(4.dp))
                        Button(
                            onClick = {
                                showAddBlockDialog = false
                                targetSsidForNewBlock = ssidKey
                                showCreateBlockDialog = true
                            },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text("+ Create New Block & Assign")
                        }
                    }
                },
                confirmButton = {
                    TextButton(onClick = { showAddBlockDialog = false }) {
                        Text("Cancel")
                    }
                }
            )
        }

        // 4. Position Picker Dialog
        positionPickingState?.let { state ->
            val aspectRatio = if (state.height > 0) state.width.toFloat() / state.height.toFloat() else 1f

            AlertDialog(
                onDismissRequest = {
                    positionPickingState = null
                    pickedPositionMessage = null
                },
                title = { Text("Pick Position in ${state.block.name}") },
                text = {
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text(
                            "Tap on the floor plan to measure signal for ${state.scanResult.SSID.ifEmpty { "Hidden" }}:",
                            style = MaterialTheme.typography.bodySmall
                        )

                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .aspectRatio(aspectRatio)
                                .clip(RoundedCornerShape(8.dp))
                                .background(MaterialTheme.colorScheme.surfaceVariant)
                                .pointerInput(state.block.id) {
                                    detectTapGestures { offset ->
                                        val px = (offset.x / size.width * state.width).toInt()
                                        val py = (offset.y / size.height * state.height).toInt()
                                        val rawSsid = state.scanResult.SSID ?: "Hidden"
                                        val ssid = if (rawSsid.isEmpty()) "Hidden" else rawSsid
                                        val coords = mapOf("x" to px, "y" to py)
                                        val body = mapOf<String, Any>(
                                            "ssid" to ssid,
                                            "wifiSsid" to ssid,
                                            "location" to mapOf("lat" to state.block.lat, "lon" to state.block.lon),
                                            "strength" to state.scanResult.level,
                                            "band" to WifiDomainUtils.frequencyToBand(state.scanResult.frequency),
                                            "security" to WifiDomainUtils.securityType(state.scanResult.capabilities),
                                            "estDistance" to WifiDomainUtils.estimateDistanceMeters(state.scanResult.level),
                                            "coordinates" to coords,
                                            "blockId" to state.block.id
                                        )

                                        coroutineScope.launch(Dispatchers.IO) {
                                            try {
                                                val response = ApiClient.instance.postWifiBlockMeasurementPath(ssid, body)
                                                val err = if (!response.isSuccessful) response.errorBody()?.string() ?: "error" else null
                                                withContext(Dispatchers.Main) {
                                                    pickedPositionMessage = if (response.isSuccessful)
                                                        "Sent at image pixel ($px, $py), ${state.scanResult.level} dBm"
                                                    else "POST failed [POST /$ssid/block] (${response.code()}): $err"
                                                }
                                            } catch (e: Exception) {
                                                withContext(Dispatchers.Main) {
                                                    pickedPositionMessage = "Network error [POST /$ssid/block]: ${e.localizedMessage}"
                                                }
                                            }
                                        }
                                    }
                                },
                            contentAlignment = Alignment.Center
                        ) {
                            AsyncImage(
                                model = state.imageUrl,
                                contentDescription = "Floor plan",
                                modifier = Modifier.matchParentSize(),
                                contentScale = ContentScale.FillBounds
                            )

                            Canvas(
                                modifier = Modifier.matchParentSize()
                            ) {
                                val rows = state.rows.takeIf { it > 0 } ?: 50
                                val cols = state.cols.takeIf { it > 0 } ?: 50
                                val cellWidth = size.width / cols
                                val cellHeight = size.height / rows

                                for (r in 0 until rows) {
                                    for (c in 0 until cols) {
                                        drawRect(
                                            color = Color.White.copy(alpha = 0.4f),
                                            topLeft = androidx.compose.ui.geometry.Offset(c * cellWidth, r * cellHeight),
                                            size = Size(cellWidth, cellHeight),
                                            style = Stroke(width = 1f)
                                        )
                                    }
                                }
                            }
                        }

                        if (pickedPositionMessage != null) {
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = pickedPositionMessage!!,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.primary
                            )
                        }
                    }
                },
                confirmButton = {
                    Button(onClick = {
                        positionPickingState = null
                        pickedPositionMessage = null
                    }) {
                        Text("Done")
                    }
                }
            )
        }
    }
}
