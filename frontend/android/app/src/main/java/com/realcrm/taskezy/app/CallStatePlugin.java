package com.realcrm.taskezy.app;

import android.Manifest;
import android.content.Context;
import android.os.Build;
import android.os.SystemClock;
import android.telephony.PhoneStateListener;
import android.telephony.TelephonyCallback;
import android.telephony.TelephonyManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

// Watches the device's call state (idle/offhook) around ONE outgoing call at
// a time, so the app can know when a call it placed to a lead has ended and
// require the caller to submit feedback before using the rest of the CRM
// again. Only READ_PHONE_STATE is used — not READ_CALL_LOG — since the app
// already knows which lead/number it dialed (recorded before launching the
// tel: intent), so there's no need to read call history after the fact.
//
// Flow: the JS side calls startWatching() right before launching `tel:`,
// then stops watching and fires "callEnded" the moment state returns to
// IDLE after having reached OFFHOOK (OFFHOOK = answered; a call that never
// connects — declined, unanswered — never reaches OFFHOOK and correctly
// never fires this event, since there's no call to give feedback on).
@CapacitorPlugin(
    name = "CallState",
    permissions = @Permission(strings = { Manifest.permission.READ_PHONE_STATE }, alias = CallStatePlugin.PHONE_STATE)
)
public class CallStatePlugin extends Plugin {

    static final String PHONE_STATE = "phoneState";

    private TelephonyManager telephonyManager;
    private PhoneStateListener legacyListener; // API < 31
    // Declared as the nested interface, not the bare TelephonyCallback base —
    // javac doesn't resolve the "CallStateListener extends TelephonyCallback"
    // relationship for an anonymous-class assignment here (a known compiler
    // quirk with this particular Android API), so registering/unregistering
    // below casts explicitly to TelephonyCallback instead.
    private TelephonyCallback.CallStateListener modernCallback; // API 31+
    private boolean watching = false;
    private boolean reachedOffHook = false;
    private long callStartElapsedMillis = 0;

    @PluginMethod
    public void startWatching(PluginCall call) {
        if (getPermissionState(PHONE_STATE) != PermissionState.GRANTED) {
            call.reject("READ_PHONE_STATE permission not granted");
            return;
        }
        if (watching) {
            // A previous call's watch was never cleanly stopped (e.g. app
            // was killed mid-call) — reset rather than stack listeners.
            stopWatchingInternal();
        }

        telephonyManager = (TelephonyManager) getContext().getSystemService(Context.TELEPHONY_SERVICE);
        if (telephonyManager == null) {
            call.reject("TelephonyManager unavailable on this device");
            return;
        }

        reachedOffHook = false;
        callStartElapsedMillis = 0;
        watching = true;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            // TelephonyCallback.CallStateListener is a nested interface that
            // extends TelephonyCallback itself, instantiated directly like
            // this (see the field's cast-on-use comment above for why it's
            // held as CallStateListener rather than TelephonyCallback).
            modernCallback = new TelephonyCallback.CallStateListener() {
                @Override
                public void onCallStateChanged(int state) {
                    handleStateChange(state);
                }
            };
            telephonyManager.registerTelephonyCallback(getContext().getMainExecutor(), (TelephonyCallback) modernCallback);
        } else {
            legacyListener = new PhoneStateListener() {
                @Override
                public void onCallStateChanged(int state, String phoneNumber) {
                    handleStateChange(state);
                }
            };
            telephonyManager.listen(legacyListener, PhoneStateListener.LISTEN_CALL_STATE);
        }

        call.resolve();
    }

    @PluginMethod
    public void stopWatching(PluginCall call) {
        stopWatchingInternal();
        call.resolve();
    }

    private void handleStateChange(int state) {
        if (state == TelephonyManager.CALL_STATE_OFFHOOK) {
            if (!reachedOffHook) {
                reachedOffHook = true;
                callStartElapsedMillis = SystemClock.elapsedRealtime();
            }
        } else if (state == TelephonyManager.CALL_STATE_IDLE) {
            if (reachedOffHook) {
                long durationSeconds = Math.max(0, (SystemClock.elapsedRealtime() - callStartElapsedMillis) / 1000);
                JSObject data = new JSObject();
                data.put("durationSeconds", durationSeconds);
                notifyListeners("callEnded", data, true);
            }
            stopWatchingInternal();
        }
    }

    private void stopWatchingInternal() {
        if (telephonyManager != null) {
            if (legacyListener != null) {
                telephonyManager.listen(legacyListener, PhoneStateListener.LISTEN_NONE);
                legacyListener = null;
            }
            if (modernCallback != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                telephonyManager.unregisterTelephonyCallback((TelephonyCallback) modernCallback);
                modernCallback = null;
            }
        }
        watching = false;
        reachedOffHook = false;
    }
}
