package com.example.wifiprovardhit.ui.radar

import android.app.Application
import android.net.wifi.ScanResult
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.wifiprovardhit.data.wifi.WifiScanner
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class RadarUiState(
    val scanResults: List<ScanResult> = emptyList(),
    val lastUpdatedMillis: Long = 0L,
    val isRefreshing: Boolean = false,
    val throttled: Boolean = false,
    val searchQuery: String = "",
    val selectedBand: BandFilter = BandFilter.ALL
)

enum class BandFilter {
    ALL, BAND_2_4_GHZ, BAND_5_GHZ, BAND_6_GHZ
}

class RadarViewModel(application: Application) : AndroidViewModel(application) {
    private val wifiScanner = WifiScanner(application)

    private val _uiState = MutableStateFlow(RadarUiState())
    val uiState: StateFlow<RadarUiState> = _uiState.asStateFlow()

    init {
        wifiScanner.registerReceiver()
        viewModelScope.launch {
            wifiScanner.snapshot.collect { snapshot ->
                _uiState.update {
                    it.copy(
                        scanResults = snapshot.results,
                        lastUpdatedMillis = snapshot.scannedAtMillis,
                        throttled = snapshot.throttled,
                        isRefreshing = false
                    )
                }
            }
        }
    }

    fun refresh() {
        _uiState.update { it.copy(isRefreshing = true) }
        wifiScanner.requestScan()
    }

    fun setSearchQuery(query: String) {
        _uiState.update { it.copy(searchQuery = query) }
    }

    fun setBandFilter(band: BandFilter) {
        _uiState.update { it.copy(selectedBand = band) }
    }

    override fun onCleared() {
        super.onCleared()
        wifiScanner.unregisterReceiver()
    }
}
