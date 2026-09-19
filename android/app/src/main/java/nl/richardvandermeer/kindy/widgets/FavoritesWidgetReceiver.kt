package nl.richardvandermeer.kindy.widgets

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews
import nl.richardvandermeer.kindy.R

class FavoritesWidgetReceiver : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, appWidgetIds: IntArray) {
        appWidgetIds.forEach { appWidgetId ->
            manager.updateAppWidget(
                appWidgetId,
                RemoteViews(context.packageName, R.layout.widget_loading),
            )
        }
    }
}
