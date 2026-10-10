package com.realcrm.taskezy.app;

import android.Manifest;
import android.database.Cursor;
import android.provider.CallLog;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

// One-shot read of android.provider.CallLog.Calls — a finite query against a
// ContentProvider, not a live listener. Deliberately NOT the same shape as
// the deleted CallStatePlugin (TelephonyManager/TelephonyCallback), which
// watched ongoing call state and got killed mid-call by Android within ~7s
// of backgrounding; there is nothing here for Android to kill mid-operation.
@CapacitorPlugin(
    name = "CallLogReader",
    permissions = @Permission(strings = { Manifest.permission.READ_CALL_LOG }, alias = CallLogPlugin.CALL_LOG)
)
public class CallLogPlugin extends Plugin {

    static final String CALL_LOG = "callLog";
    private static final int MAX_ROWS = 1000;

    // coreLibraryDesugaring is not enabled in this project's build.gradle
    // (checked: no such flag anywhere under android/), so java.time is not
    // safely available at minSdk 24 here — format manually instead.
    private static String toIso8601(long epochMillis) {
        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        sdf.setTimeZone(TimeZone.getTimeZone("UTC"));
        return sdf.format(new Date(epochMillis));
    }

    private static String mapCallType(int type) {
        switch (type) {
            case CallLog.Calls.INCOMING_TYPE:
                return "INCOMING";
            case CallLog.Calls.OUTGOING_TYPE:
                return "OUTGOING";
            case CallLog.Calls.MISSED_TYPE:
                return "MISSED";
            case CallLog.Calls.REJECTED_TYPE:
                return "REJECTED";
            case CallLog.Calls.BLOCKED_TYPE:
                return "BLOCKED";
            default:
                return "UNKNOWN";
        }
    }

    @PluginMethod
    public void readEntries(PluginCall call) {
        if (getPermissionState(CALL_LOG) != PermissionState.GRANTED) {
            call.reject("READ_CALL_LOG permission not granted");
            return;
        }

        long sinceMillis = call.getLong("sinceMillis", 0L);

        String[] projection = {
            CallLog.Calls.NUMBER,
            CallLog.Calls.TYPE,
            CallLog.Calls.DATE,
            CallLog.Calls.DURATION
        };
        String selection = sinceMillis > 0 ? CallLog.Calls.DATE + " > ?" : null;
        String[] selectionArgs = sinceMillis > 0 ? new String[] { String.valueOf(sinceMillis) } : null;
        String sortOrder = CallLog.Calls.DATE + " DESC";

        try (Cursor cursor = getContext()
            .getContentResolver()
            .query(CallLog.Calls.CONTENT_URI, projection, selection, selectionArgs, sortOrder)) {
            JSArray entries = new JSArray();

            if (cursor != null) {
                int numberIdx = cursor.getColumnIndex(CallLog.Calls.NUMBER);
                int typeIdx = cursor.getColumnIndex(CallLog.Calls.TYPE);
                int dateIdx = cursor.getColumnIndex(CallLog.Calls.DATE);
                int durationIdx = cursor.getColumnIndex(CallLog.Calls.DURATION);

                int rowCount = 0;
                while (cursor.moveToNext() && rowCount < MAX_ROWS) {
                    String phoneNumber = numberIdx >= 0 ? cursor.getString(numberIdx) : null;
                    int callType = typeIdx >= 0 ? cursor.getInt(typeIdx) : -1;
                    long dateMillis = dateIdx >= 0 ? cursor.getLong(dateIdx) : 0L;
                    int durationSeconds = durationIdx >= 0 ? cursor.getInt(durationIdx) : 0;

                    JSObject entry = new JSObject();
                    entry.put("phoneNumber", phoneNumber == null ? "" : phoneNumber);
                    entry.put("callType", mapCallType(callType));
                    entry.put("callDate", toIso8601(dateMillis));
                    entry.put("durationSeconds", durationSeconds);
                    entries.put(entry);

                    rowCount++;
                }
            }

            JSObject result = new JSObject();
            result.put("entries", entries);
            call.resolve(result);
        } catch (RuntimeException e) {
            call.reject("Failed to read call log: " + e.getMessage());
        }
    }
}
