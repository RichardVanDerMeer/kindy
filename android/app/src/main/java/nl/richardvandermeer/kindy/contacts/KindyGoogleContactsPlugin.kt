package nl.richardvandermeer.kindy.contacts

import android.accounts.Account
import android.app.Activity
import android.content.Intent
import android.content.IntentSender
import android.net.Uri
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.android.gms.auth.api.identity.AuthorizationRequest
import com.google.android.gms.auth.api.identity.AuthorizationResult
import com.google.android.gms.auth.api.identity.Identity
import com.google.android.gms.auth.api.identity.RevokeAccessRequest
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.common.api.Scope
import java.net.HttpURLConnection
import java.net.URL

@CapacitorPlugin(name = "KindyGoogleContacts", requestCodes = [AUTHORIZATION_REQUEST_CODE])
class KindyGoogleContactsPlugin : Plugin() {
    private var accessToken: String? = null
    private var account: Account? = null

    @PluginMethod
    fun authorize(call: PluginCall) {
        val scopes = requestedScopes()
        val builder = AuthorizationRequest.builder().setRequestedScopes(scopes)
        if (call.getBoolean("interactive", true) == true) {
            builder.setPrompt(AuthorizationRequest.Prompt.SELECT_ACCOUNT)
        }

        Identity.getAuthorizationClient(activity)
            .authorize(builder.build())
            .addOnSuccessListener { result ->
                if (result.hasResolution() && call.getBoolean("interactive", true) != true) {
                    // Background sync must never open Google's consent screen.
                    call.reject("Google consent is required", "CONSENT_REQUIRED")
                    return@addOnSuccessListener
                }
                if (result.hasResolution()) {
                    val pendingIntent = result.pendingIntent
                    if (pendingIntent == null) {
                        call.reject("Google authorization did not provide a resolution")
                        return@addOnSuccessListener
                    }
                    saveCall(call)
                    try {
                        activity.startIntentSenderForResult(
                            pendingIntent.intentSender,
                            AUTHORIZATION_REQUEST_CODE,
                            null,
                            0,
                            0,
                            0,
                        )
                    } catch (error: IntentSender.SendIntentException) {
                        call.reject("Unable to open Google authorization", error)
                    }
                } else {
                    resolveAuthorization(call, result)
                }
            }
            .addOnFailureListener { error -> call.reject("Google authorization failed", error) }
    }

    @Deprecated("Capacitor request-code bridge")
    override fun handleOnActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode != AUTHORIZATION_REQUEST_CODE) return
        val call = savedCall ?: return
        if (resultCode != Activity.RESULT_OK || data == null) {
            call.reject("Google authorization was cancelled")
            freeSavedCall()
            return
        }

        try {
            val result = Identity.getAuthorizationClient(activity).getAuthorizationResultFromIntent(data)
            resolveAuthorization(call, result)
        } catch (error: ApiException) {
            call.reject("Google authorization failed", error)
        } finally {
            freeSavedCall()
        }
    }

    @PluginMethod
    fun listConnections(call: PluginCall) {
        val token = accessToken
        if (token == null) {
            call.reject("Google Contacts is not authorized")
            return
        }

        execute {
            try {
                val uri = Uri.parse(PEOPLE_CONNECTIONS_URL).buildUpon()
                    .appendQueryParameter("pageSize", "100")
                    .appendQueryParameter("personFields", PERSON_FIELDS)
                    .appendQueryParameter("sources", "READ_SOURCE_TYPE_CONTACT")
                    .appendQueryParameter("requestSyncToken", "true")

                call.getString("pageToken")?.let { uri.appendQueryParameter("pageToken", it) }
                call.getString("syncToken")?.let { uri.appendQueryParameter("syncToken", it) }
                if (call.getString("syncToken") == null) {
                    uri.appendQueryParameter("sortOrder", "FIRST_NAME_ASCENDING")
                }

                val response = get(uri.build().toString(), token)
                if (response.status !in 200..299) {
                    val expired = response.body.contains("EXPIRED_SYNC_TOKEN")
                    call.resolve(
                        JSObject().apply {
                            put("expiredSyncToken", expired)
                            put("status", response.status)
                        },
                    )
                    return@execute
                }
                call.resolve(JSObject(response.body))
            } catch (error: Exception) {
                call.reject("Unable to read Google Contacts", error)
            }
        }
    }

    @PluginMethod
    fun getContact(call: PluginCall) {
        val token = requireToken(call) ?: return
        val resourceName = requireResourceName(call) ?: return
        execute {
            try {
                val uri = Uri.parse("$PEOPLE_API_URL/$resourceName").buildUpon()
                    .appendQueryParameter("personFields", WRITABLE_FIELDS)
                    .build()
                resolveJson(call, send("GET", uri.toString(), token, null))
            } catch (error: Exception) {
                call.reject("Unable to read the Google contact", error)
            }
        }
    }

    @PluginMethod
    fun updateContact(call: PluginCall) {
        val token = requireToken(call) ?: return
        val resourceName = requireResourceName(call) ?: return
        val person = call.getObject("person")
        val fields = call.getString("updatePersonFields")
        if (person == null || fields.isNullOrBlank()) {
            call.reject("A person and updatePersonFields are required")
            return
        }
        execute {
            try {
                val uri = Uri.parse("$PEOPLE_API_URL/$resourceName:updateContact").buildUpon()
                    .appendQueryParameter("updatePersonFields", fields)
                    .appendQueryParameter("personFields", WRITABLE_FIELDS)
                    .build()
                resolveJson(call, send("PATCH", uri.toString(), token, person.toString()))
            } catch (error: Exception) {
                call.reject("Unable to update the Google contact", error)
            }
        }
    }

    @PluginMethod
    fun updateContactPhoto(call: PluginCall) {
        val token = requireToken(call) ?: return
        val resourceName = requireResourceName(call) ?: return
        val photoBytes = call.getString("photoBytes")
        if (photoBytes.isNullOrBlank()) {
            call.reject("Photo bytes are required")
            return
        }
        execute {
            try {
                val body = JSObject().apply {
                    put("photoBytes", photoBytes)
                    put("personFields", "photos,metadata")
                }
                val uri = "$PEOPLE_API_URL/$resourceName:updateContactPhoto"
                resolveJson(call, send("PATCH", uri, token, body.toString()))
            } catch (error: Exception) {
                call.reject("Unable to update the Google contact photo", error)
            }
        }
    }

    @PluginMethod
    fun createContact(call: PluginCall) {
        val token = requireToken(call) ?: return
        val person = call.getObject("person")
        if (person == null) {
            call.reject("A person is required")
            return
        }
        execute {
            try {
                val uri = Uri.parse("$PEOPLE_API_URL/people:createContact").buildUpon()
                    .appendQueryParameter("personFields", WRITABLE_FIELDS)
                    .build()
                resolveJson(call, send("POST", uri.toString(), token, person.toString()))
            } catch (error: Exception) {
                call.reject("Unable to create the Google contact", error)
            }
        }
    }

    @PluginMethod
    fun findBackup(call: PluginCall) {
        val token = requireToken(call) ?: return
        val name = call.getString("name")
        if (name == null || !name.matches(BACKUP_NAME_PATTERN)) {
            call.reject("A valid backup name is required")
            return
        }
        execute {
            try {
                val uri = Uri.parse("$DRIVE_API_URL/files").buildUpon()
                    .appendQueryParameter("spaces", "appDataFolder")
                    .appendQueryParameter("q", "name = '$name' and trashed = false")
                    .appendQueryParameter("fields", "files(id,modifiedTime,size)")
                    .appendQueryParameter("orderBy", "modifiedTime desc")
                    .appendQueryParameter("pageSize", "1")
                    .build()
                val response = send("GET", uri.toString(), token, null)
                if (response.status !in 200..299) {
                    call.reject("Google Drive returned HTTP ${response.status}", response.status.toString())
                    return@execute
                }
                val files = JSObject(response.body).getJSONArray("files")
                call.resolve(
                    JSObject().apply {
                        if (files.length() > 0) put("file", files.getJSONObject(0))
                    },
                )
            } catch (error: Exception) {
                call.reject("Unable to read the Google Drive backup", error)
            }
        }
    }

    @PluginMethod
    fun uploadBackup(call: PluginCall) {
        val token = requireToken(call) ?: return
        val name = call.getString("name")
        val content = call.getString("content")
        val fileId = call.getString("fileId")
        if (name == null || !name.matches(BACKUP_NAME_PATTERN) || content == null) {
            call.reject("A backup name and content are required")
            return
        }
        if (fileId != null && !fileId.matches(DRIVE_ID_PATTERN)) {
            call.reject("Invalid backup file id")
            return
        }
        execute {
            try {
                val response = if (fileId == null) {
                    // New file: multipart upload with metadata that places it in the app folder.
                    val boundary = "kindy-${System.currentTimeMillis()}"
                    val metadata = JSObject().apply {
                        put("name", name)
                        put("parents", org.json.JSONArray().put("appDataFolder"))
                    }
                    val body = buildString {
                        append("--$boundary\r\n")
                        append("Content-Type: application/json; charset=UTF-8\r\n\r\n")
                        append(metadata.toString()).append("\r\n")
                        append("--$boundary\r\n")
                        append("Content-Type: application/json; charset=UTF-8\r\n\r\n")
                        append(content).append("\r\n")
                        append("--$boundary--")
                    }
                    val uri = "$DRIVE_UPLOAD_URL/files?uploadType=multipart&fields=id,modifiedTime,size"
                    send("POST", uri, token, body, "multipart/related; boundary=$boundary")
                } else {
                    val uri = "$DRIVE_UPLOAD_URL/files/$fileId?uploadType=media&fields=id,modifiedTime,size"
                    send("PATCH", uri, token, content)
                }
                if (response.status !in 200..299) {
                    call.reject("Google Drive returned HTTP ${response.status}", response.status.toString())
                    return@execute
                }
                call.resolve(JSObject(response.body))
            } catch (error: Exception) {
                call.reject("Unable to upload the Google Drive backup", error)
            }
        }
    }

    @PluginMethod
    fun downloadBackup(call: PluginCall) {
        val token = requireToken(call) ?: return
        val fileId = call.getString("fileId")
        if (fileId == null || !fileId.matches(DRIVE_ID_PATTERN)) {
            call.reject("A valid backup file id is required")
            return
        }
        execute {
            try {
                val response = send("GET", "$DRIVE_API_URL/files/$fileId?alt=media", token, null)
                if (response.status !in 200..299) {
                    call.reject("Google Drive returned HTTP ${response.status}", response.status.toString())
                    return@execute
                }
                call.resolve(JSObject().apply { put("content", response.body) })
            } catch (error: Exception) {
                call.reject("Unable to download the Google Drive backup", error)
            }
        }
    }

    @PluginMethod
    fun revoke(call: PluginCall) {
        val selectedAccount = account
        if (selectedAccount == null) {
            accessToken = null
            call.resolve()
            return
        }
        val request = RevokeAccessRequest.builder()
            .setAccount(selectedAccount)
            .setScopes(requestedScopes())
            .build()
        Identity.getAuthorizationClient(activity)
            .revokeAccess(request)
            .addOnSuccessListener {
                accessToken = null
                account = null
                call.resolve()
            }
            .addOnFailureListener { error -> call.reject("Unable to revoke Google access", error) }
    }

    @Suppress("DEPRECATION")
    private fun resolveAuthorization(call: PluginCall, result: AuthorizationResult) {
        val token = result.accessToken
        if (token.isNullOrBlank()) {
            call.reject("Google authorization returned no access token")
            return
        }
        accessToken = token
        val googleAccount = result.toGoogleSignInAccount()
        account = googleAccount?.account
        call.resolve(
            JSObject().apply {
                put("provider", "google")
                put("providerAccountId", googleAccount?.id ?: googleAccount?.email ?: "google")
                put("displayName", googleAccount?.displayName ?: googleAccount?.email)
            },
        )
    }

    private fun requestedScopes(): List<Scope> = listOf(
        Scope(CONTACTS_SCOPE),
        Scope(DRIVE_APPDATA_SCOPE),
        Scope("openid"),
        Scope("profile"),
        Scope("email"),
    )

    private fun requireToken(call: PluginCall): String? {
        val token = accessToken
        if (token == null) call.reject("Google Contacts is not authorized", "NOT_AUTHORIZED")
        return token
    }

    private fun requireResourceName(call: PluginCall): String? {
        val resourceName = call.getString("resourceName")
        if (resourceName == null || !resourceName.matches(RESOURCE_NAME_PATTERN)) {
            call.reject("A valid contact resource name is required")
            return null
        }
        return resourceName
    }

    private fun resolveJson(call: PluginCall, response: HttpResponse) {
        if (response.status in 200..299) {
            call.resolve(JSObject(response.body))
        } else {
            // Only the status is passed on; response bodies may contain contact details.
            call.reject("Google Contacts returned HTTP ${response.status}", response.status.toString())
        }
    }

    private fun get(url: String, token: String): HttpResponse = send("GET", url, token, null)

    /**
     * HttpURLConnection has no PATCH, so PATCH is sent as POST with Google's
     * documented X-HTTP-Method-Override header.
     */
    private fun send(
        method: String,
        url: String,
        token: String,
        body: String?,
        contentType: String = "application/json; charset=utf-8",
    ): HttpResponse {
        val connection = URL(url).openConnection() as HttpURLConnection
        return try {
            connection.requestMethod = if (method == "PATCH") "POST" else method
            if (method == "PATCH") connection.setRequestProperty("X-HTTP-Method-Override", "PATCH")
            connection.connectTimeout = 15_000
            connection.readTimeout = 20_000
            connection.setRequestProperty("Authorization", "Bearer $token")
            connection.setRequestProperty("Accept", "application/json")
            if (body != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", contentType)
                connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            HttpResponse(status, stream?.bufferedReader()?.use { it.readText() }.orEmpty())
        } finally {
            connection.disconnect()
        }
    }

    private data class HttpResponse(val status: Int, val body: String)
}

private const val AUTHORIZATION_REQUEST_CODE = 9412
private const val CONTACTS_SCOPE = "https://www.googleapis.com/auth/contacts"
private const val PEOPLE_API_URL = "https://people.googleapis.com/v1"
private const val DRIVE_APPDATA_SCOPE = "https://www.googleapis.com/auth/drive.appdata"
private const val DRIVE_API_URL = "https://www.googleapis.com/drive/v3"
private const val DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3"
private val BACKUP_NAME_PATTERN = Regex("^[a-z0-9-]+\\.json$")
private val DRIVE_ID_PATTERN = Regex("^[A-Za-z0-9_-]+$")
private const val WRITABLE_FIELDS = "names,phoneNumbers,emailAddresses,birthdays,events,photos,metadata"
private val RESOURCE_NAME_PATTERN = Regex("^people/[A-Za-z0-9_-]+$")
private const val PEOPLE_CONNECTIONS_URL = "https://people.googleapis.com/v1/people/me/connections"
private const val PERSON_FIELDS =
    "names,nicknames,emailAddresses,phoneNumbers,addresses,birthdays,events,organizations,photos,memberships,metadata,urls"
