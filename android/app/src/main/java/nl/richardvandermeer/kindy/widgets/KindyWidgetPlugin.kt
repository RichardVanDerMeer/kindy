package nl.richardvandermeer.kindy.widgets

import androidx.glance.appwidget.updateAll
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

@CapacitorPlugin(name = "KindyWidget")
class KindyWidgetPlugin : Plugin() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    /** Stores the prepared "Coming up" content and redraws every placed widget. */
    @PluginMethod
    fun writeComingUp(call: PluginCall) {
        val snapshot = call.getString("snapshot")
        if (snapshot == null || snapshot.length > MAX_SNAPSHOT_LENGTH) {
            call.reject("A widget snapshot is required")
            return
        }
        if (ComingUpSnapshotStore.parse(snapshot) == null) {
            call.reject("The widget snapshot is not valid")
            return
        }
        ComingUpSnapshotStore(context).write(snapshot)
        scope.launch {
            try {
                ComingUpWidget().updateAll(context)
            } catch (error: Exception) {
                // The widget redraws on its next update period.
            }
        }
        call.resolve()
    }

    companion object {
        private const val MAX_SNAPSHOT_LENGTH = 100_000
    }
}
