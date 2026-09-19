package nl.richardvandermeer.kindy.widgets

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "KindyWidget")
class KindyWidgetPlugin : Plugin() {
    @PluginMethod
    fun refresh(call: PluginCall) {
        val manager = AppWidgetManager.getInstance(context)
        manager.notifyAppWidgetViewDataChanged(
            manager.getAppWidgetIds(ComponentName(context, ComingUpWidgetReceiver::class.java)),
            android.R.id.list,
        )
        manager.notifyAppWidgetViewDataChanged(
            manager.getAppWidgetIds(ComponentName(context, FavoritesWidgetReceiver::class.java)),
            android.R.id.list,
        )
        call.resolve()
    }
}
