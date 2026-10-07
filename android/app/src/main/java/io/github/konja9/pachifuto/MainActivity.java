package io.github.konja9.pachifuto;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.google.android.gms.games.PlayGamesSdk;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // アプリの中に書いたプラグインは、Capacitor が始まる前に登録する
        registerPlugin(PlayGamesPlugin.class);
        super.onCreate(savedInstanceState);
        // Play Games Services：Play Console の ID（res/values/games-ids.xml）が入っているときだけ始める
        if (PlayGamesPlugin.configured(this)) PlayGamesSdk.initialize(this);
    }
}
