package nl.richardvandermeer.kindy.security

import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "KindySecurity")
class KindySecurityPlugin : Plugin() {
    private val authenticators =
        BiometricManager.Authenticators.BIOMETRIC_STRONG or
            BiometricManager.Authenticators.DEVICE_CREDENTIAL

    @PluginMethod
    fun availability(call: PluginCall) {
        val status = BiometricManager.from(context).canAuthenticate(authenticators)
        call.resolve(
            JSObject().apply {
                put("available", status == BiometricManager.BIOMETRIC_SUCCESS)
                put("status", status)
            },
        )
    }

    @PluginMethod
    fun isAppLockEnabled(call: PluginCall) {
        val enabled = context
            .getSharedPreferences(PREFERENCES_NAME, android.content.Context.MODE_PRIVATE)
            .getBoolean(APP_LOCK_ENABLED, false)
        call.resolve(JSObject().apply { put("enabled", enabled) })
    }

    @PluginMethod
    fun setAppLockEnabled(call: PluginCall) {
        val enabled = call.getBoolean("enabled")
        if (enabled == null) {
            call.reject("enabled is required")
            return
        }
        context.getSharedPreferences(PREFERENCES_NAME, android.content.Context.MODE_PRIVATE)
            .edit()
            .putBoolean(APP_LOCK_ENABLED, enabled)
            .apply()
        call.resolve()
    }

    @PluginMethod
    fun getDatabasePassphrase(call: PluginCall) {
        try {
            val passphrase = KindySecretStore(context).getOrCreateDatabasePassphrase()
            call.resolve(JSObject().apply { put("passphrase", passphrase) })
        } catch (error: Exception) {
            call.reject("Unable to access the protected database key", error)
        }
    }

    @PluginMethod
    fun authenticate(call: PluginCall) {
        val activity = activity as? FragmentActivity
        if (activity == null) {
            call.reject("Authentication is unavailable")
            return
        }

        if (BiometricManager.from(context).canAuthenticate(authenticators) != BiometricManager.BIOMETRIC_SUCCESS) {
            call.reject("No supported biometric or device credential is configured")
            return
        }

        val executor = ContextCompat.getMainExecutor(context)
        val prompt = BiometricPrompt(
            activity,
            executor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    call.resolve(JSObject().apply { put("authenticated", true) })
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    call.resolve(
                        JSObject().apply {
                            put("authenticated", false)
                            put("errorCode", errorCode)
                        },
                    )
                }
            },
        )
        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Kindy ontgrendelen")
            .setSubtitle("Gebruik biometrie of je apparaatslot")
            .setAllowedAuthenticators(authenticators)
            .build()

        activity.runOnUiThread { prompt.authenticate(promptInfo) }
    }

    private companion object {
        const val PREFERENCES_NAME = "kindy.secure.preferences"
        const val APP_LOCK_ENABLED = "app_lock_enabled"
    }
}
