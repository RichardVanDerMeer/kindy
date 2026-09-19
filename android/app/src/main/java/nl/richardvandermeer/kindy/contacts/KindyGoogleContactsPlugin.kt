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
        Scope(CONTACTS_READONLY_SCOPE),
        Scope("openid"),
        Scope("profile"),
        Scope("email"),
    )

    private fun get(url: String, token: String): HttpResponse {
        val connection = URL(url).openConnection() as HttpURLConnection
        return try {
            connection.requestMethod = "GET"
            connection.connectTimeout = 15_000
            connection.readTimeout = 20_000
            connection.setRequestProperty("Authorization", "Bearer $token")
            connection.setRequestProperty("Accept", "application/json")
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
private const val CONTACTS_READONLY_SCOPE = "https://www.googleapis.com/auth/contacts.readonly"
private const val PEOPLE_CONNECTIONS_URL = "https://people.googleapis.com/v1/people/me/connections"
private const val PERSON_FIELDS =
    "names,nicknames,emailAddresses,phoneNumbers,addresses,birthdays,organizations,photos,memberships,metadata,urls"
