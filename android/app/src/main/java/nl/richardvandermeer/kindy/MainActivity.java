package nl.richardvandermeer.kindy;

import com.getcapacitor.BridgeActivity;

import android.os.Bundle;

import nl.richardvandermeer.kindy.security.KindySecurityPlugin;
import nl.richardvandermeer.kindy.widgets.KindyWidgetPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(KindySecurityPlugin.class);
        registerPlugin(KindyWidgetPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
