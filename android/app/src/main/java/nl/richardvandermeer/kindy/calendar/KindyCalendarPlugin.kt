package nl.richardvandermeer.kindy.calendar

import android.Manifest
import android.content.ContentUris
import android.content.ContentValues
import android.provider.CalendarContract
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import java.util.TimeZone

/**
 * Reads appointments from, and adds appointments to, the phone's calendar
 * storage. That storage holds every synced account (Google, Exchange, ...), so
 * Kindy needs no separate calendar sign-in. Appointment contents are only
 * returned to Kindy; nothing is logged.
 */
@CapacitorPlugin(
    name = "KindyCalendar",
    permissions = [
        Permission(
            alias = CALENDAR_ALIAS,
            strings = [Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR],
        ),
    ],
)
class KindyCalendarPlugin : Plugin() {
    @PluginMethod
    fun listCalendars(call: PluginCall) {
        if (!hasCalendarAccess(call)) return
        execute {
            try {
                val calendars = JSArray()
                val projection = arrayOf(
                    CalendarContract.Calendars._ID,
                    CalendarContract.Calendars.CALENDAR_DISPLAY_NAME,
                    CalendarContract.Calendars.ACCOUNT_NAME,
                    CalendarContract.Calendars.IS_PRIMARY,
                )
                context.contentResolver.query(
                    CalendarContract.Calendars.CONTENT_URI,
                    projection,
                    "${CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL} >= ? AND ${CalendarContract.Calendars.VISIBLE} = 1",
                    arrayOf(CalendarContract.Calendars.CAL_ACCESS_CONTRIBUTOR.toString()),
                    null,
                )?.use { cursor ->
                    while (cursor.moveToNext()) {
                        calendars.put(
                            JSObject().apply {
                                put("id", cursor.getLong(0).toString())
                                put("name", cursor.getString(1) ?: "")
                                put("accountName", cursor.getString(2))
                                put("isPrimary", cursor.getInt(3) == 1)
                            },
                        )
                    }
                }
                call.resolve(JSObject().apply { put("calendars", calendars) })
            } catch (error: Exception) {
                call.reject("Unable to read calendars", error)
            }
        }
    }

    @PluginMethod
    fun listEvents(call: PluginCall) {
        if (!hasCalendarAccess(call)) return
        val from = call.getLong("from")
        val to = call.getLong("to")
        if (from == null || to == null || to < from) {
            call.reject("A valid time range is required")
            return
        }
        execute {
            try {
                val builder = CalendarContract.Instances.CONTENT_URI.buildUpon()
                ContentUris.appendId(builder, from)
                ContentUris.appendId(builder, to)
                val projection = arrayOf(
                    CalendarContract.Instances.EVENT_ID,
                    CalendarContract.Instances.CALENDAR_ID,
                    CalendarContract.Instances.CALENDAR_DISPLAY_NAME,
                    CalendarContract.Instances.TITLE,
                    CalendarContract.Instances.BEGIN,
                    CalendarContract.Instances.END,
                    CalendarContract.Instances.ALL_DAY,
                    CalendarContract.Instances.EVENT_LOCATION,
                )
                val events = mutableListOf<JSObject>()
                val eventIds = mutableSetOf<Long>()
                context.contentResolver.query(
                    builder.build(),
                    projection,
                    null,
                    null,
                    "${CalendarContract.Instances.BEGIN} ASC",
                )?.use { cursor ->
                    while (cursor.moveToNext()) {
                        val eventId = cursor.getLong(0)
                        eventIds.add(eventId)
                        events.add(
                            JSObject().apply {
                                put("id", eventId.toString())
                                put("calendarId", cursor.getLong(1).toString())
                                put("calendarName", cursor.getString(2))
                                put("title", cursor.getString(3) ?: "")
                                put("startsAt", cursor.getLong(4))
                                put("endsAt", cursor.getLong(5))
                                put("allDay", cursor.getInt(6) == 1)
                                put("location", cursor.getString(7))
                            },
                        )
                    }
                }
                val attendees = attendeeEmails(eventIds)
                val result = JSArray()
                for (event in events) {
                    val eventId = event.getString("id")?.toLongOrNull()
                    event.put("attendeeEmails", JSArray(attendees[eventId] ?: emptyList<String>()))
                    result.put(event)
                }
                call.resolve(JSObject().apply { put("events", result) })
            } catch (error: Exception) {
                call.reject("Unable to read appointments", error)
            }
        }
    }

    @PluginMethod
    fun createEvent(call: PluginCall) {
        if (!hasCalendarAccess(call)) return
        val calendarId = call.getString("calendarId")?.toLongOrNull()
        val title = call.getString("title")
        val startsAt = call.getLong("startsAt")
        val endsAt = call.getLong("endsAt")
        val allDay = call.getBoolean("allDay", false) == true
        if (calendarId == null || title.isNullOrBlank() || startsAt == null || endsAt == null) {
            call.reject("Calendar, title and times are required")
            return
        }
        execute {
            try {
                val values = ContentValues().apply {
                    put(CalendarContract.Events.CALENDAR_ID, calendarId)
                    put(CalendarContract.Events.TITLE, title)
                    put(CalendarContract.Events.DTSTART, startsAt)
                    put(CalendarContract.Events.DTEND, endsAt)
                    put(CalendarContract.Events.ALL_DAY, if (allDay) 1 else 0)
                    // All-day events must be stored in UTC; timed events in the local zone.
                    put(
                        CalendarContract.Events.EVENT_TIMEZONE,
                        if (allDay) "UTC" else TimeZone.getDefault().id,
                    )
                    call.getString("location")?.let { put(CalendarContract.Events.EVENT_LOCATION, it) }
                    call.getString("description")?.let { put(CalendarContract.Events.DESCRIPTION, it) }
                }
                val uri = context.contentResolver.insert(CalendarContract.Events.CONTENT_URI, values)
                if (uri == null) {
                    call.reject("The calendar did not accept the appointment")
                    return@execute
                }
                call.resolve(JSObject().apply { put("id", ContentUris.parseId(uri).toString()) })
            } catch (error: Exception) {
                call.reject("Unable to add the appointment", error)
            }
        }
    }

    /**
     * Updates an appointment by id. The app only calls this for appointments it
     * created itself; appointments from other sources are never changed.
     */
    @PluginMethod
    fun updateEvent(call: PluginCall) {
        if (!hasCalendarAccess(call)) return
        val eventId = call.getString("id")?.toLongOrNull()
        val title = call.getString("title")
        val startsAt = call.getLong("startsAt")
        val endsAt = call.getLong("endsAt")
        val allDay = call.getBoolean("allDay", false) == true
        if (eventId == null || title.isNullOrBlank() || startsAt == null || endsAt == null) {
            call.reject("Appointment, title and times are required")
            return
        }
        execute {
            try {
                val values = ContentValues().apply {
                    put(CalendarContract.Events.TITLE, title)
                    put(CalendarContract.Events.DTSTART, startsAt)
                    put(CalendarContract.Events.DTEND, endsAt)
                    put(CalendarContract.Events.ALL_DAY, if (allDay) 1 else 0)
                    put(
                        CalendarContract.Events.EVENT_TIMEZONE,
                        if (allDay) "UTC" else TimeZone.getDefault().id,
                    )
                    put(CalendarContract.Events.EVENT_LOCATION, call.getString("location"))
                }
                val uri = ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, eventId)
                val updated = context.contentResolver.update(uri, values, null, null)
                if (updated == 1) call.resolve() else call.reject("The appointment was not found")
            } catch (error: Exception) {
                call.reject("Unable to update the appointment", error)
            }
        }
    }

    private fun attendeeEmails(eventIds: Set<Long>): Map<Long, List<String>> {
        if (eventIds.isEmpty()) return emptyMap()
        val result = mutableMapOf<Long, MutableList<String>>()
        // Query in chunks to stay within SQLite's limit on bound parameters.
        for (chunk in eventIds.chunked(500)) {
            val placeholders = chunk.joinToString(",") { "?" }
            context.contentResolver.query(
                CalendarContract.Attendees.CONTENT_URI,
                arrayOf(CalendarContract.Attendees.EVENT_ID, CalendarContract.Attendees.ATTENDEE_EMAIL),
                "${CalendarContract.Attendees.EVENT_ID} IN ($placeholders)",
                chunk.map { it.toString() }.toTypedArray(),
                null,
            )?.use { cursor ->
                while (cursor.moveToNext()) {
                    val email = cursor.getString(1) ?: continue
                    result.getOrPut(cursor.getLong(0)) { mutableListOf() }.add(email)
                }
            }
        }
        return result
    }

    private fun hasCalendarAccess(call: PluginCall): Boolean {
        if (getPermissionState(CALENDAR_ALIAS) == PermissionState.GRANTED) return true
        call.reject("Calendar permission is required", "PERMISSION_DENIED")
        return false
    }
}

private const val CALENDAR_ALIAS = "calendar"
