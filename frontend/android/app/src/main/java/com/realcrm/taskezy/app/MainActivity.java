package com.realcrm.taskezy.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

// CallStatePlugin is this app's own plugin (not a published npm package),
// so it's registered directly here rather than through cap sync's
// capacitor.settings.gradle/capacitor.build.gradle scaffolding, which is
// only for distributable plugins.
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CallStatePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
