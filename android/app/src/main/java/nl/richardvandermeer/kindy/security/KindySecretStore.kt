package nl.richardvandermeer.kindy.security

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

internal class KindySecretStore(private val context: Context) {
    private val preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    fun getOrCreateDatabasePassphrase(): String {
        val encrypted = preferences.getString(PASSPHRASE_VALUE, null)
        val iv = preferences.getString(PASSPHRASE_IV, null)
        if (encrypted != null && iv != null) return decrypt(encrypted, iv)

        val passphraseBytes = ByteArray(32).also(SecureRandom()::nextBytes)
        val passphrase = Base64.encodeToString(passphraseBytes, Base64.NO_WRAP)
        val encryptedValue = encrypt(passphrase)
        preferences.edit()
            .putString(PASSPHRASE_VALUE, encryptedValue.value)
            .putString(PASSPHRASE_IV, encryptedValue.iv)
            .apply()
        return passphrase
    }

    private fun encrypt(value: String): EncryptedValue {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        return EncryptedValue(
            value = Base64.encodeToString(cipher.doFinal(value.toByteArray(Charsets.UTF_8)), Base64.NO_WRAP),
            iv = Base64.encodeToString(cipher.iv, Base64.NO_WRAP),
        )
    }

    private fun decrypt(value: String, iv: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(
            Cipher.DECRYPT_MODE,
            getOrCreateKey(),
            GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)),
        )
        return String(cipher.doFinal(Base64.decode(value, Base64.NO_WRAP)), Charsets.UTF_8)
    }

    private fun getOrCreateKey(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }

        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build(),
        )
        return generator.generateKey()
    }

    private data class EncryptedValue(val value: String, val iv: String)

    private companion object {
        const val ANDROID_KEYSTORE = "AndroidKeyStore"
        const val KEY_ALIAS = "kindy.database.passphrase.v1"
        const val PREFERENCES_NAME = "kindy.secure.preferences"
        const val PASSPHRASE_VALUE = "database_passphrase"
        const val PASSPHRASE_IV = "database_passphrase_iv"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
    }
}
