package nl.richardvandermeer.kindy.widgets

import android.content.Context
import org.json.JSONObject

internal data class ComingUpItem(
    val date: String,
    val title: String,
    val personId: String?,
)

internal data class ComingUpSnapshot(
    val heading: String,
    val empty: String,
    val today: String,
    val tomorrow: String,
    val locale: String,
    val items: List<ComingUpItem>,
)

/**
 * Holds the widget's content as prepared by the app. The app already filtered
 * it (and hid names when asked or when the app lock is on); the widget never
 * reads Kindy's database.
 */
internal class ComingUpSnapshotStore(context: Context) {
    private val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

    fun write(json: String) {
        preferences.edit().putString(KEY, json).apply()
    }

    fun read(): ComingUpSnapshot? = preferences.getString(KEY, null)?.let(::parse)

    companion object {
        private const val PREFERENCES = "kindy_widgets"
        private const val KEY = "coming_up"
        private val DATE = Regex("^\\d{4}-\\d{2}-\\d{2}$")
        private val PERSON_ID = Regex("^[A-Za-z0-9_-]{1,64}$")

        /** Returns null for anything that is not a valid snapshot. */
        fun parse(json: String): ComingUpSnapshot? = try {
            val root = JSONObject(json)
            val labels = root.getJSONObject("labels")
            val items = root.getJSONArray("items")
            ComingUpSnapshot(
                heading = root.getString("heading"),
                empty = root.getString("empty"),
                today = labels.getString("today"),
                tomorrow = labels.getString("tomorrow"),
                locale = root.optString("locale", "en"),
                items = (0 until items.length()).mapNotNull { index ->
                    val item = items.getJSONObject(index)
                    val date = item.getString("date")
                    if (!date.matches(DATE)) return@mapNotNull null
                    ComingUpItem(
                        date = date,
                        title = item.getString("title"),
                        personId = item.optString("personId").takeIf { it.matches(PERSON_ID) },
                    )
                },
            )
        } catch (error: Exception) {
            null
        }
    }
}
