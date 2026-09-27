package nl.richardvandermeer.kindy.widgets

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.LocalSize
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import kotlin.math.roundToLong
import nl.richardvandermeer.kindy.MainActivity
import nl.richardvandermeer.kindy.R

/** "Coming up": the next birthdays, anniversaries and appointments on the home screen. */
class ComingUpWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Responsive(setOf(SMALL, MEDIUM, LARGE))

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val snapshot = ComingUpSnapshotStore(context).read()
        val fallback = context.getString(R.string.widget_open_app)
        provideContent { WidgetContent(context, snapshot, fallback) }
    }

    companion object {
        private val SMALL = DpSize(180.dp, 110.dp)
        private val MEDIUM = DpSize(250.dp, 180.dp)
        private val LARGE = DpSize(250.dp, 280.dp)
    }
}

private val Surface = Color(0xFFFFFDFD)
private val RowSurface = Color(0xFFF6F1FF)
private val Heading = Color(0xFF6633EE)
private val Ink = Color(0xFF1C0752)
private val Muted = Color(0xFF70669A)
private const val DAY_MS = 86_400_000.0

@Composable
private fun WidgetContent(context: Context, snapshot: ComingUpSnapshot?, fallback: String) {
    val height = LocalSize.current.height
    val maxRows = when {
        height >= 280.dp -> 5
        height >= 180.dp -> 3
        else -> 2
    }
    val today = dayKey(Calendar.getInstance())
    // The snapshot may be a few days old; past days are dropped here.
    val items = snapshot?.items.orEmpty().filter { it.date >= today }.take(maxRows)
    val muted = TextStyle(color = ColorProvider(Muted), fontSize = 13.sp)

    Column(
        modifier = GlanceModifier
            .fillMaxSize()
            .background(Surface)
            .cornerRadius(24.dp)
            .padding(12.dp)
            .clickable(actionStartActivity(openIntent(context, "kindy://upcoming"))),
    ) {
        Text(
            text = snapshot?.heading ?: context.getString(R.string.app_name),
            style = TextStyle(color = ColorProvider(Heading), fontSize = 15.sp, fontWeight = FontWeight.Bold),
        )
        Spacer(GlanceModifier.height(6.dp))
        when {
            snapshot == null -> Text(fallback, style = muted)
            items.isEmpty() -> Text(snapshot.empty, style = muted)
            else -> items.forEach { item ->
                ItemRow(context, snapshot, item)
                Spacer(GlanceModifier.height(6.dp))
            }
        }
    }
}

@Composable
private fun ItemRow(context: Context, snapshot: ComingUpSnapshot, item: ComingUpItem) {
    val locale = Locale.forLanguageTag(snapshot.locale)
    val date = parseDay(item.date)
    val link = item.personId?.let { "kindy://people/$it" } ?: "kindy://upcoming"
    Row(
        modifier = GlanceModifier
            .fillMaxWidth()
            .background(RowSurface)
            .cornerRadius(14.dp)
            .padding(horizontal = 8.dp, vertical = 6.dp)
            .clickable(actionStartActivity(openIntent(context, link))),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(
            modifier = GlanceModifier.width(36.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = date?.let { SimpleDateFormat("d", locale).format(it.time) } ?: "",
                style = TextStyle(color = ColorProvider(Ink), fontSize = 16.sp, fontWeight = FontWeight.Bold),
            )
            Text(
                text = date?.let { SimpleDateFormat("MMM", locale).format(it.time).trimEnd('.') } ?: "",
                style = TextStyle(color = ColorProvider(Muted), fontSize = 10.sp),
            )
        }
        Spacer(GlanceModifier.width(8.dp))
        Column {
            Text(
                text = relativeDay(date, snapshot, locale),
                style = TextStyle(color = ColorProvider(Muted), fontSize = 11.sp),
                maxLines = 1,
            )
            Text(
                text = item.title,
                style = TextStyle(color = ColorProvider(Ink), fontSize = 13.sp, fontWeight = FontWeight.Medium),
                maxLines = 1,
            )
        }
    }
}

private fun openIntent(context: Context, link: String): Intent =
    Intent(context, MainActivity::class.java).apply {
        action = Intent.ACTION_VIEW
        data = Uri.parse(link)
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }

private fun dayKey(calendar: Calendar): String =
    SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(calendar.time)

private fun parseDay(value: String): Calendar? = try {
    val parsed = SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).parse(value)
    parsed?.let { Calendar.getInstance().apply { time = it; set(Calendar.HOUR_OF_DAY, 12) } }
} catch (error: Exception) {
    null
}

/** "Today", "Tomorrow", a weekday this week, or a short date further out. */
private fun relativeDay(date: Calendar?, snapshot: ComingUpSnapshot, locale: Locale): String {
    if (date == null) return ""
    val noon = Calendar.getInstance().apply { set(Calendar.HOUR_OF_DAY, 12) }
    val days = ((date.timeInMillis - noon.timeInMillis) / DAY_MS).roundToLong()
    val label = when {
        days <= 0L -> snapshot.today
        days == 1L -> snapshot.tomorrow
        days < 7L -> SimpleDateFormat("EEEE", locale).format(date.time)
        else -> SimpleDateFormat("EEEE d MMMM", locale).format(date.time)
    }
    return label.replaceFirstChar { if (it.isLowerCase()) it.titlecase(locale) else it.toString() }
}
