package vn.thucphamsomot.order;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SaveDocumentPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
