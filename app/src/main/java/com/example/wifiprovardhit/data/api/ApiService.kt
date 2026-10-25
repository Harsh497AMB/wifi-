package com.example.wifiprovardhit.data.api

import okhttp3.MultipartBody
import okhttp3.RequestBody
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.*

data class BlockServerResponse(
    val success: Boolean,
    val count: Int,
    val blocks: List<ServerBlockItem>?
)

data class ServerBlockItem(
    val blockId: String,
    val blockName: String,
    val location: ServerLocation?,
    val blockImage: ServerBlockImage?
)

data class ServerLocation(val lat: Double, val lon: Double)
data class ServerBlockImage(val url: String?, val filename: String?)

data class WifiBlockServerResponse(
    val success: Boolean,
    val wifi: WifiData?,
    val block: BlockData?
)

data class WifiData(
    val ssid: String,
    val rows: Int? = null,
    val cols: Int? = null,
    val matrix: List<List<Any?>>? = null,
    val measurements: List<MeasurementItem>? = null
)

data class BlockData(
    val blockId: String,
    val blockName: String,
    val image: BlockImageDetails?
)

data class BlockImageDetails(
    val filename: String?,
    val url: String?,
    val width: Int? = null,
    val height: Int? = null
)

data class MeasurementItem(
    val x: Double,
    val y: Double,
    val strength: Double
)

interface ApiService {

    @GET("blocks")
    suspend fun getRoot(): Response<ResponseBody>

    @Multipart
    @POST("createBlock")
    suspend fun createBlock(
        @Part blockImage: MultipartBody.Part?,
        @Part("blockName") blockName: RequestBody,
        @Part("lat") lat: RequestBody,
        @Part("lon") lon: RequestBody
    ): Response<ResponseBody>

    @POST("addblock")
    suspend fun addBlock(
        @Body body: Map<String, @JvmSuppressWildcards Any>
    ): Response<ResponseBody>

    @POST("delete")
    suspend fun deleteBlock(
        @Body body: Map<String, @JvmSuppressWildcards Any>
    ): Response<ResponseBody>

    @POST("calibrateBlock")
    suspend fun calibrateBlock(
        @Body body: Map<String, @JvmSuppressWildcards Any>
    ): Response<ResponseBody>

    @POST("calculateDistance")
    suspend fun calculateDistance(
        @Body body: Map<String, @JvmSuppressWildcards Any>
    ): Response<ResponseBody>

    @GET("blocks")
    suspend fun getAllBlocks(): Response<BlockServerResponse>

    @GET("block/{blockId}")
    suspend fun getBlockById(
        @Path("blockId") blockId: String
    ): Response<ResponseBody>

    @GET("block/{blockId}/image")
    suspend fun getBlockImage(
        @Path("blockId") blockId: String
    ): Response<ResponseBody>

    @GET("SSID/block")
    suspend fun getWifiBlock(
        @Query("ssid") ssid: String
    ): Response<ResponseBody>

    @GET("{ssid}/block")
    suspend fun getWifiBlockPath(
        @Path("ssid") ssid: String,
        @Query("blockId") blockId: String? = null,
        @Query("blockName") blockName: String? = null,
        @Query("lat") lat: Double? = null,
        @Query("lon") lon: Double? = null
    ): Response<WifiBlockServerResponse>

    @POST("SSID/block")
    suspend fun postWifiBlockMeasurement(
        @Body body: Map<String, @JvmSuppressWildcards Any>
    ): Response<ResponseBody>

    @POST("SSID/block")
    suspend fun postWifiBlockMeasurementPath(
        @Path("ssid") ssid: String,
        @Body body: Map<String, @JvmSuppressWildcards Any>
    ): Response<ResponseBody>

    @GET("wifis")
    suspend fun getAllWifis(): Response<ResponseBody>

    @GET("wifi/{ssid}")
    suspend fun getWifiBySsid(
        @Path("ssid") ssid: String
    ): Response<ResponseBody>
}
