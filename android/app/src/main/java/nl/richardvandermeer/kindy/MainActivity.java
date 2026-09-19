package nl.richardvandermeer.kindy;

import com.getcapacitor.BridgeActivity;

import android.os.Bundle;
import android.view.WindowManager;

import nl.richardvandermeer.kindy.security.KindySecurityPlugin;
import nl.richardvandermeer.kindy.widgets.KindyWidgetPlugin;
import nl.richardvandermeer.kindy.contacts.KindyGoogleContactsPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        );
        registerPlugin(KindySecurityPlugin.class);
        registerPlugin(KindyWidgetPlugin.class);
        registerPlugin(KindyGoogleContactsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
